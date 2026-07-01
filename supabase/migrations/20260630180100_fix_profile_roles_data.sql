-- 001 (el jefe) y 005 (contadora) habían quedado en el default de columna
-- ('supervisor') en vez del rol de diseño documentado en CLAUDE.md:
-- 001/002 = admin, 003/004 = supervisor, 005 = trabajador.
update profiles set role = 'admin' where username = '001' and role <> 'admin';
update profiles set role = 'trabajador' where username = '005' and role <> 'trabajador';
