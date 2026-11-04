# Endpoint trace index
- Total endpoints: **116**
- Linked to handler: **26**

## Top 15 endpoints by call-tree size
| Method | Path | Tag | Nodes | Files touched | Card |
|--------|------|-----|-------|---------------|------|
| GET | `/api/health` | src | 1 | 1 | [detail](endpoints/GET_api_health.md) |
| GET | `/api/ready` | src | 1 | 1 | [detail](endpoints/GET_api_ready.md) |
| GET | `/api/internal/metrics` | src | 1 | 1 | [detail](endpoints/GET_api_internal_metrics.md) |
| GET | `/api/auth/config` | src | 1 | 1 | [detail](endpoints/GET_api_auth_config.md) |
| GET | `/api/prices` | src | 1 | 1 | [detail](endpoints/GET_api_prices.md) |
| POST | `/api/auth/register` | src | 1 | 1 | [detail](endpoints/POST_api_auth_register.md) |
| POST | `/api/auth/verify` | src | 1 | 1 | [detail](endpoints/POST_api_auth_verify.md) |
| POST | `/api/auth/resend` | src | 1 | 1 | [detail](endpoints/POST_api_auth_resend.md) |
| POST | `/api/auth/login` | src | 1 | 1 | [detail](endpoints/POST_api_auth_login.md) |
| GET | `/api/auth/me` | src | 1 | 1 | [detail](endpoints/GET_api_auth_me.md) |
| POST | `/api/auth/logout` | src | 1 | 1 | [detail](endpoints/POST_api_auth_logout.md) |
| POST | `/api/auth/forgot` | src | 1 | 1 | [detail](endpoints/POST_api_auth_forgot.md) |
| POST | `/api/auth/reset` | src | 1 | 1 | [detail](endpoints/POST_api_auth_reset.md) |
| POST | `/api/game-ticket` | src | 1 | 1 | [detail](endpoints/POST_api_game-ticket.md) |
| GET | `/api/wardrobe` | src | 1 | 1 | [detail](endpoints/GET_api_wardrobe.md) |

## Functions called from 2+ endpoints (top 20)
| Symbol | File:Line | Used by N endpoints |
|--------|-----------|----------------------|
| `phoneUser` | `apps/api/src/app.ts:287` | 26 |