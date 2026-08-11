// Hand-maintained OpenAPI 3.0 document, kept as a plain JS object (instead of
// a YAML file loaded at runtime) so it stays a single source of truth that's
// diffed and reviewed exactly like any other source file, with no extra
// YAML-parsing dependency. Update this alongside any route/controller change
// — nothing generates it automatically from the Express routes.

const bearerAuth = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Access token returned by /auth/login, /auth/register, or /auth/refresh. Sent as `Authorization: Bearer <token>`.'
  }
};

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    details: { type: 'array', items: { type: 'object' }, description: 'Present on 400 validation errors (Zod issues).' }
  }
};

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    role: { type: 'string', enum: ['admin', 'reviewer', 'author'] },
    created_at: { type: 'string', format: 'date-time' }
  }
};

const projectSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    owner_id: { type: 'string', format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    role: { type: 'string', enum: ['admin', 'reviewer', 'author'], description: "Caller's effective role in this project (owner always resolves to admin). Present on single-project responses." }
  }
};

const memberSchema = {
  type: 'object',
  properties: {
    project_id: { type: 'string', format: 'uuid' },
    user_id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['admin', 'reviewer', 'author'] }
  }
};

const reviewSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    project_id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    code_snapshot: { type: 'string', description: 'Full text of the current/latest revision. Capped at 500,000 characters.' },
    author_id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['open', 'approved', 'changes_requested'] },
    created_at: { type: 'string', format: 'date-time' },
    projectRole: { type: 'string', enum: ['admin', 'reviewer', 'author'], description: "Caller's effective role in the parent project. Present on single-review responses only — never cached or shared across users." }
  }
};

const revisionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    review_id: { type: 'string', format: 'uuid' },
    revision_number: { type: 'integer' },
    code_snapshot: { type: 'string' },
    author_id: { type: 'string', format: 'uuid' },
    author_name: { type: 'string', description: 'Only present on list responses (joined), omitted on the single-revision fetch.' },
    created_at: { type: 'string', format: 'date-time' }
  }
};

const commentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    review_id: { type: 'string', format: 'uuid' },
    line_number: { type: 'integer', nullable: true, description: 'null for a general (not line-anchored) comment.' },
    author_id: { type: 'string', format: 'uuid' },
    author_name: { type: 'string' },
    content: { type: 'string', description: 'Markdown. Sanitized server-side before storage.' },
    parent_id: { type: 'string', format: 'uuid', nullable: true },
    resolved_at: { type: 'string', format: 'date-time', nullable: true },
    resolved_by: { type: 'string', format: 'uuid', nullable: true },
    created_at: { type: 'string', format: 'date-time' }
  }
};

const paginationSchema = {
  type: 'object',
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' }
  }
};

const notificationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    user_id: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: ['reply', 'mention'] },
    review_id: { type: 'string', format: 'uuid', nullable: true },
    comment_id: { type: 'string', format: 'uuid', nullable: true },
    actor_id: { type: 'string', format: 'uuid' },
    actor_name: { type: 'string' },
    review_title: { type: 'string', nullable: true },
    read_at: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' }
  }
};

const authTokensSchema = {
  type: 'object',
  properties: {
    accessToken: { type: 'string', description: 'Short-lived JWT (default 15m).' },
    refreshToken: { type: 'string', description: 'Opaque, long-lived token — store client-side and send to /auth/refresh.' }
  }
};

const notFound = { description: 'Not found', content: { 'application/json': { schema: errorSchema } } };
const badRequest = { description: 'Validation failed', content: { 'application/json': { schema: errorSchema } } };
const forbidden = { description: 'Forbidden — caller lacks the required role', content: { 'application/json': { schema: errorSchema } } };
const unauthorized = { description: 'Missing or invalid access token', content: { 'application/json': { schema: errorSchema } } };

const pageParam = { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } };

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Code Review Hub API',
    version: '1.0.0',
    description:
      'REST + Socket.io API behind Code Review Hub. Every endpoint below except /health and /api/auth/* requires a bearer access token. ' +
      'Live features (new comments, typing indicators, resolved-state changes, new revisions, notifications) are delivered over Socket.io ' +
      "on top of this REST API — see the project README's Socket.io section for event names and payloads."
  },
  servers: [{ url: '/api', description: 'API root (mounted under /api on the HTTP server)' }],
  components: {
    securitySchemes: bearerAuth,
    schemas: {
      Error: errorSchema,
      User: userSchema,
      Project: projectSchema,
      ProjectMember: memberSchema,
      Review: reviewSchema,
      Revision: revisionSchema,
      Comment: commentSchema,
      Notification: notificationSchema,
      Pagination: paginationSchema,
      AuthTokens: authTokensSchema
    },
    responses: { NotFound: notFound, BadRequest: badRequest, Forbidden: forbidden, Unauthorized: unauthorized }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account and receive a token pair',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string', minLength: 1, maxLength: 255 }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Account created',
            content: { 'application/json': { schema: { allOf: [authTokensSchema, { type: 'object', properties: { user: userSchema } }] } } }
          },
          400: badRequest,
          409: { description: 'Email already registered', content: { 'application/json': { schema: errorSchema } } }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange credentials for a token pair',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Authenticated',
            content: { 'application/json': { schema: { allOf: [authTokensSchema, { type: 'object', properties: { user: userSchema } }] } } }
          },
          400: badRequest,
          401: { description: 'Invalid email or password', content: { 'application/json': { schema: errorSchema } } }
        }
      }
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate a refresh token for a new token pair',
        description: 'The submitted refreshToken is revoked (single-use) even on success — the response contains a new one.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } }
        },
        responses: {
          200: { description: 'New token pair', content: { 'application/json': { schema: authTokensSchema } } },
          400: badRequest,
          401: { description: 'Invalid, expired, or already-revoked refresh token', content: { 'application/json': { schema: errorSchema } } }
        }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token',
        description: 'refreshToken is optional in the body — omitting it (or sending no body at all) still returns 204, it just has nothing to revoke.',
        security: [],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } }
        },
        responses: { 204: { description: 'Logged out' } }
      }
    },

    '/projects': {
      get: {
        tags: ['Projects'],
        summary: "List projects the caller owns or is a member of",
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: projectSchema } } } }, 401: unauthorized }
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a project (caller becomes its admin)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 255 } } } } } },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: projectSchema } } }, 400: badRequest, 401: unauthorized }
      }
    },
    '/projects/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { tags: ['Projects'], summary: 'Get a project', responses: { 200: { description: 'OK', content: { 'application/json': { schema: projectSchema } } }, 404: notFound } },
      patch: {
        tags: ['Projects'],
        summary: 'Rename a project (admin only)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: projectSchema } } }, 403: forbidden, 404: notFound }
      },
      delete: { tags: ['Projects'], summary: 'Delete a project (admin only)', responses: { 204: { description: 'Deleted' }, 403: forbidden, 404: notFound } }
    },
    '/projects/{id}/members': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { tags: ['Projects'], summary: 'List project members', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: memberSchema } } } }, 404: notFound } },
      post: {
        tags: ['Projects'],
        summary: 'Add a member by email (admin only)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['admin', 'reviewer', 'author'], default: 'author' } } } } }
        },
        responses: { 201: { description: 'Added', content: { 'application/json': { schema: memberSchema } } }, 403: forbidden, 404: { description: 'Project or user not found', content: { 'application/json': { schema: errorSchema } } } }
      }
    },
    '/projects/{id}/members/{userId}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
      ],
      patch: {
        tags: ['Projects'],
        summary: "Change a member's role (admin only, not the owner)",
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'reviewer', 'author'] } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: memberSchema } } }, 400: badRequest, 403: forbidden, 404: notFound }
      },
      delete: { tags: ['Projects'], summary: 'Remove a member (admin only, not the owner)', responses: { 204: { description: 'Removed' }, 400: badRequest, 403: forbidden } }
    },

    '/projects/{projectId}/reviews': {
      parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Reviews'],
        summary: 'List reviews in a project (paginated, filterable, cached)',
        description: 'Response is read-through cached in Redis for 30s per unique combination of filters + page; any write to the project\'s reviews invalidates the whole cache immediately.',
        parameters: [
          pageParam,
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'approved', 'changes_requested'] } },
          { name: 'authorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'q', in: 'query', description: 'Case-insensitive substring match on title', schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object', properties: { reviews: { type: 'array', items: reviewSchema }, pagination: paginationSchema } } } }
          },
          404: notFound
        }
      },
      post: {
        tags: ['Reviews'],
        summary: 'Create a review (writes the review + its first revision atomically)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['title', 'codeSnapshot'], properties: { title: { type: 'string', minLength: 1, maxLength: 255 }, codeSnapshot: { type: 'string', maxLength: 500000 } } } } }
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: reviewSchema } } }, 400: badRequest, 404: notFound }
      }
    },
    '/reviews/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { tags: ['Reviews'], summary: 'Get a review by id (works across projects; access still enforced)', responses: { 200: { description: 'OK', content: { 'application/json': { schema: reviewSchema } } }, 404: notFound } },
      delete: { tags: ['Reviews'], summary: 'Delete a review (author, project admin, or global admin)', responses: { 204: { description: 'Deleted' }, 403: forbidden, 404: notFound } }
    },
    '/reviews/{id}/status': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      patch: {
        tags: ['Reviews'],
        summary: 'Change review status (reviewer/admin only — authors cannot self-approve)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['open', 'approved', 'changes_requested'] } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: reviewSchema } } }, 403: forbidden, 404: notFound }
      }
    },
    '/reviews/{id}/revisions': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Reviews'],
        summary: 'List revisions for a review (metadata only, no code_snapshot)',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: revisionSchema } } } }, 404: notFound }
      },
      post: {
        tags: ['Reviews'],
        summary: 'Push a new revision (review author or project admin only)',
        description: 'Updates the review\'s code_snapshot to the new revision and broadcasts a review:revision Socket.io event to everyone viewing it.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['codeSnapshot'], properties: { codeSnapshot: { type: 'string', maxLength: 500000 } } } } } },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: revisionSchema } } }, 400: badRequest, 403: forbidden, 404: notFound }
      }
    },
    '/reviews/{id}/revisions/{revisionId}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'revisionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
      ],
      get: { tags: ['Reviews'], summary: 'Get one revision including its full code_snapshot', responses: { 200: { description: 'OK', content: { 'application/json': { schema: revisionSchema } } }, 404: notFound } }
    },

    '/reviews/{reviewId}/comments': {
      parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Comments'],
        summary: 'List comment threads on a review (paginated by thread, cached)',
        description:
          'A page is N top-level comments plus all of their replies — a thread is never split across pages. ' +
          'Cached for 15s per page; new comments still arrive instantly for active viewers via the comment:new Socket.io event regardless of this cache.',
        parameters: [pageParam, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { comments: { type: 'array', items: commentSchema }, pagination: paginationSchema } } } } },
          404: notFound
        }
      },
      post: {
        tags: ['Comments'],
        summary: 'Post a comment or reply',
        description: 'Content is Markdown and is sanitized server-side. Triggers reply/@mention notifications (best-effort) and a comment:new Socket.io broadcast.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', minLength: 1, maxLength: 10000 },
                  lineNumber: { type: 'integer', nullable: true, description: 'Omit or null for a general (not line-anchored) comment.' },
                  parentId: { type: 'string', format: 'uuid', nullable: true, description: 'Set to reply to an existing top-level comment.' }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: commentSchema } } }, 400: badRequest, 404: notFound }
      }
    },
    '/reviews/{reviewId}/comments/{commentId}/resolved': {
      parameters: [
        { name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'commentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
      ],
      patch: {
        tags: ['Comments'],
        summary: 'Mark a top-level comment thread resolved/unresolved',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['resolved'], properties: { resolved: { type: 'boolean' } } } } } },
        responses: { 200: { description: 'Updated', content: { 'application/json': { schema: commentSchema } } }, 400: { description: 'Comment is a reply, not a top-level comment', content: { 'application/json': { schema: errorSchema } } }, 404: notFound }
      }
    },
    '/reviews/{reviewId}/comments/{commentId}': {
      parameters: [
        { name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'commentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
      ],
      delete: {
        tags: ['Comments'],
        summary: 'Delete a comment (author, project admin, or global admin)',
        description: 'Cascades to delete any replies to this comment.',
        responses: { 204: { description: 'Deleted' }, 403: forbidden, 404: notFound }
      }
    },

    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List the most recent 50 notifications for the caller',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: notificationSchema } } } } }
      }
    },
    '/notifications/read-all': {
      patch: { tags: ['Notifications'], summary: 'Mark all of the caller\'s notifications as read', responses: { 204: { description: 'No content' } } }
    },
    '/notifications/{id}/read': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      patch: { tags: ['Notifications'], summary: 'Mark one notification as read', responses: { 200: { description: 'OK', content: { 'application/json': { schema: notificationSchema } } }, 404: notFound } }
    }
  }
};
