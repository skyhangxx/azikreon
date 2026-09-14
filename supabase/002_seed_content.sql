-- Current visible copy: index.html + the approved overrides formerly in main.js.
-- Stable IDs make this import repeatable without overwriting later CMS edits.
begin;
insert into public.cms_teachers (id, name, description, image_path, sort_order, is_published) values
('6148c3c4-cd3c-4ad5-b841-91d676b12001', 'Ли Хваин', 'Носитель корейского языка. Помогает сделать речь естественнее и увереннее через спокойную практику.', '/assets/images/teacher-hwain.webp', 10, true),
('6148c3c4-cd3c-4ad5-b841-91d676b12002', 'Ли Джехёк', 'Ведёт разговорные занятия, помогает перестать переводить каждую фразу в голове перед ответом.', '/assets/images/teacher-jaehyuk.webp', 20, true)
on conflict (id) do nothing;
-- No real reviews exist in the source: the three HTML cards are aria-hidden placeholders.
-- Do not seed fabricated names, locations, ratings or testimonials.
commit;
