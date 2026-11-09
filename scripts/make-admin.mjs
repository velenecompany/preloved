// Da el rol de administrador a una cuenta ya registrada.
// Uso: npm run make-admin -- tu@correo.com
import pg from "pg";

const email = process.argv[2];
if (!email) {
  console.error("Uso: npm run make-admin -- tu@correo.com");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1|host=\//.test(url) ? false : { rejectUnauthorized: true },
});
await client.connect();

const { rows } = await client.query("select id, full_name from users where lower(email) = lower($1)", [email]);
if (!rows[0]) {
  console.error(`No hay una cuenta con el correo ${email}. Regístrate primero en /registro.`);
  await client.end();
  process.exit(1);
}

await client.query("begin");
await client.query("insert into user_roles (user_id, role) values ($1, 'admin') on conflict do nothing", [rows[0].id]);
await client.query(
  "insert into audit_logs (actor_id, action, entity, entity_id, data) values (null, 'rol_otorgado', 'users', $1, $2)",
  [rows[0].id, JSON.stringify({ rol: "admin", origen: "script make-admin" })],
);
await client.query("commit");
await client.end();
console.log(`${rows[0].full_name ?? email} ahora es administrador.`);
