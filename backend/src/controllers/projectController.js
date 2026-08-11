import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';
import { sanitizePlainText } from '../utils/sanitize.js';

const createProjectSchema = z.object({
  name: z.string().min(1).max(255)
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'reviewer', 'author']).default('author')
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'reviewer', 'author'])
});

// A project is visible to its owner and any project_members row. Also
// resolves the caller's *effective* project role — the owner always acts as
// admin even if their project_members row somehow lagged behind — so
// downstream handlers can make role-based decisions without a second query.
async function assertProjectAccess(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT p.*, pm.role AS member_role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id IS NOT NULL)`,
    [projectId, userId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Project not found');
  const project = rows[0];
  const role = project.owner_id === userId ? 'admin' : project.member_role;
  return { ...project, role };
}

export async function listProjects(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.* FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.owner_id = $1 OR pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createProject(req, res, next) {
  try {
    const { name } = createProjectSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO projects (name, owner_id) VALUES ($1, $2) RETURNING *`,
      [sanitizePlainText(name, { fieldName: 'name' }), req.user.id]
    );
    const project = rows[0];
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [project.id, req.user.id]
    );
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
}

export async function getProject(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    res.json(project);
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    if (project.role !== 'admin' && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only a project admin can update this project');
    }
    const { name } = createProjectSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE projects SET name = $1 WHERE id = $2 RETURNING *`,
      [sanitizePlainText(name, { fieldName: 'name' }), project.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    if (project.role !== 'admin' && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only a project admin can delete this project');
    }
    await pool.query('DELETE FROM projects WHERE id = $1', [project.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listMembers(req, res, next) {
  try {
    await assertProjectAccess(req.params.id, req.user.id); // any member can view the roster
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, pm.role
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function addMember(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    if (project.role !== 'admin') {
      throw new HttpError(403, 'Only a project admin can add members');
    }
    const { email, role } = addMemberSchema.parse(req.body);
    const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRows.length === 0) throw new HttpError(404, 'No user with that email');

    const { rows } = await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING project_id, user_id, role`,
      [project.id, userRows[0].id, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateMemberRole(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    if (project.role !== 'admin') {
      throw new HttpError(403, 'Only a project admin can change member roles');
    }
    if (req.params.userId === project.owner_id) {
      throw new HttpError(400, "Can't change the project owner's role");
    }
    const { role } = updateMemberRoleSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3
       RETURNING project_id, user_id, role`,
      [role, project.id, req.params.userId]
    );
    if (rows.length === 0) throw new HttpError(404, 'Member not found');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    if (project.role !== 'admin') {
      throw new HttpError(403, 'Only a project admin can remove members');
    }
    if (req.params.userId === project.owner_id) {
      throw new HttpError(400, "Can't remove the project owner");
    }
    await pool.query(
      'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project.id, req.params.userId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export { assertProjectAccess };
