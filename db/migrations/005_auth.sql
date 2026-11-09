-- =====================================================================
-- Fase 2: autenticación
-- - session_version: al cambiar o restablecer la contraseña se incrementa y
--   todas las sesiones anteriores dejan de servir.
-- - login_attempts: límite de intentos por correo y por IP.
-- =====================================================================

alter table users add column session_version int not null default 1;

create table login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip text,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_email_idx on login_attempts (lower(email), created_at desc);
create index login_attempts_ip_idx on login_attempts (ip, created_at desc);

create index email_verification_tokens_user_idx on email_verification_tokens (user_id);
create index password_reset_tokens_user_idx on password_reset_tokens (user_id);

-- Un rol de personal nunca se asigna por sí mismo: siempre queda registrado quién lo dio.
create index user_roles_role_idx on user_roles (role);
