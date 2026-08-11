import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

const createProjectSchema = z.object({
  name: z.string().min(1).max(255)
});

// A project is visible to its owner and any project_members row.
async function assertProjectAccess(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT p.* FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id IS NOT NULL)`,
    [projectId, userId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Project not found');
  return rows[0];
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
      [name, req.user.id]
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
    if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only the owner or an admin can update this project');
    }
    const { name } = createProjectSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE projects SET name = $1 WHERE id = $2 RETURNING *`,
      [name, project.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const project = await assertProjectAccess(req.params.id, req.user.id);
    if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, 'Only the owner or an admin can delete this project');
    }
    await pool.query('DELETE FROM projects WHERE id = $1', [project.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export { assertProjectAccess };
