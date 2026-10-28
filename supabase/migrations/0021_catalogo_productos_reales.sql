-- ============================================================================
-- NuraVision · 0021 · Catalogo de productos reales (fotos del estudio)
-- ============================================================================
-- Numeracion: se usa 0021 y no 0020 porque una rama paralela ya ocupa 0020
-- con `actualizar_mi_perfil`. El hueco es intencional; no renumerar.
--
-- Carga los 21 productos fotografiados en el estudio el 2026-10-01, tal como
-- quedaron en fotos-carrusel-productos/catalogo-propuesto.json (2026-10-28).
-- Las imagenes viven en frontend/public/productos/<slug>.jpg y Vite las sirve
-- en la raiz, por eso imagen_url se arma con el slug y no se escribe a mano.
--
-- ⚠  PRECIOS Y STOCK A CONFIRMAR POR LA PO (2026-10-28).
--    Son estimaciones de mercado, no precios del estudio. El stock es un
--    marcador: con valor, crear_pedido lo descuenta y rechaza la venta al
--    llegar a cero. Corregir desde Panel → Productos, no con otra migracion.
--
-- Solo datos, sin cambios de esquema ni de RLS: las politicas de productos
-- (lectura publica, gestion por es_staff) son las de 0013.
--
-- POR QUE `on conflict (slug) do nothing` Y NO UPSERT:
-- Si se reaplica despues de que el panel haya editado precio, stock o texto,
-- un `do update` pisaria esas correcciones con las estimaciones de este
-- archivo. Con `do nothing` la migracion solo crea lo que falta.
--
-- POR QUE NO SE TOCAN LOS 10 PRODUCTOS DEL SEED DE 0013:
-- Ninguno coincide con un producto fotografiado (otras marcas y formatos), y
-- siguen en uso: `kit-ritual-manos` es el SLUG_KIT_COMBO de crear_pedido, y
-- hay slugs del seed fijos en el front (Nuria, recomendaciones, fixtures e2e).
-- Desactivarlos es decision pendiente de la PO y, si se toma, va en su propia
-- migracion despues de que el front deje de referenciarlos.
--
-- Decisiones provisionales:
--   · El iluminador essence va en `piel`: es maquillaje y no hay categoria
--     para eso. Crear una exige tocar el check de 0013 y categorias.ts.
--   · `pack-mascarillas-kiss-beauty` (kits) depende de que el estudio venda
--     el pack. Su stock es independiente del de cada mascarilla: crear_pedido
--     no descuenta componentes.
--   · orden 110..310 deja los nuevos despues del seed (10..100), en el orden
--     del JSON.
--
-- servicio_id se resuelve igual que en el seed de 0013: primer servicio
-- activo cuyo nombre haga ilike con el patron, por prioridad. Sin
-- coincidencia queda NULL en vez de fallar.
-- ============================================================================

insert into public.productos
  (slug, nombre, categoria, tamano, precio, precio_anterior, insignia, servicio_id,
   descripcion, modo_uso, ingredientes, stock, imagen_url, orden)
select
  v.slug, v.nombre, v.categoria, v.tamano, v.precio, v.precio_anterior, v.insignia,
  (select s.id
     from unnest(v.servicio) with ordinality as patron (texto, prioridad)
     join public.servicios s on s.activo and s.nombre ilike patron.texto
    order by patron.prioridad, s.id
    limit 1),
  v.descripcion, v.modo_uso, v.ingredientes, v.stock,
  '/productos/' || v.slug || '.jpg',
  v.orden
from (
  values
    ('crema-manos-pies-gonails-cotton-candy-500ml', 'Crema de manos y pies GoNails Cotton Candy', 'unas_manos', '500 ml', 10990, null::integer, null::text, array['Manicura Completa', '%manicur%'],
     'Crema para manos y pies con aroma a algodón de azúcar. Hidrata sin dejar la piel grasosa y el formato con dispensador dura meses.',
     'Aplica sobre manos y pies limpios y masajea hasta que se absorba. Úsala después de cada lavado.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 6, 110),
    ('crema-manos-pies-gonails-lemon-pie-500ml', 'Crema de manos y pies GoNails Lemon Pie', 'unas_manos', '500 ml', 10990, null, null, array['Manicura Completa', '%manicur%'],
     'Crema para manos y pies con aroma a pie de limón. Hidrata sin dejar la piel grasosa y el formato con dispensador dura meses.',
     'Aplica sobre manos y pies limpios y masajea hasta que se absorba. Úsala después de cada lavado.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 6, 120),
    ('crema-manos-pies-gonails-lolipop-500ml', 'Crema de manos y pies GoNails Lolipop', 'unas_manos', '500 ml', 10990, null, null, array['Manicura Completa', '%manicur%'],
     'Crema para manos y pies con aroma a dulce de colores. Hidrata sin dejar la piel grasosa y el formato con dispensador dura meses.',
     'Aplica sobre manos y pies limpios y masajea hasta que se absorba. Úsala después de cada lavado.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 6, 130),
    ('crema-manos-pies-gonails-popcorn-500ml', 'Crema de manos y pies GoNails Popcorn', 'unas_manos', '500 ml', 10990, null, null, array['Manicura Completa', '%manicur%'],
     'Crema para manos y pies con aroma a cabritas dulces. Hidrata sin dejar la piel grasosa y el formato con dispensador dura meses.',
     'Aplica sobre manos y pies limpios y masajea hasta que se absorba. Úsala después de cada lavado.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 6, 140),
    ('crema-manos-pies-gonails-cotton-candy-60ml', 'Crema de manos y pies GoNails Cotton Candy mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'La crema Cotton Candy en pomo de bolsillo, para llevar en la cartera y retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 150),
    ('crema-manos-pies-gonails-lemon-pie-60ml', 'Crema de manos y pies GoNails Lemon Pie mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'La crema Lemon Pie en pomo de bolsillo, para llevar en la cartera y retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 160),
    ('crema-manos-pies-gonails-cupcake-60ml', 'Crema de manos y pies GoNails Cupcake mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'Crema de manos y pies con aroma a cupcake, en pomo de bolsillo para retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 170),
    ('crema-manos-pies-gonails-watermelon-gum-60ml', 'Crema de manos y pies GoNails Watermelon Gum mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'Crema de manos y pies con aroma a chicle de sandía, en pomo de bolsillo para retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 180),
    ('crema-manos-pies-gonails-strawberry-cake-60ml', 'Crema de manos y pies GoNails Strawberry Cake mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'Crema de manos y pies con aroma a torta de frutilla, en pomo de bolsillo para retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 190),
    ('crema-manos-pies-gonails-hot-chocolate-60ml', 'Crema de manos y pies GoNails Hot Chocolate mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'Crema de manos y pies con aroma a chocolate caliente, en pomo de bolsillo para retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 200),
    ('crema-manos-pies-gonails-pistacho-caramelo-60ml', 'Crema de manos y pies GoNails Pistacho y caramelo mini', 'unas_manos', '60 ml', 4490, null, null, array['Manicura Completa', '%manicur%'],
     'Crema de manos y pies con aroma a pistacho y caramelo, en pomo de bolsillo para retocar la hidratación durante el día.',
     'Aplica una pequeña cantidad y masajea hasta que se absorba, las veces que lo necesites.',
     'Manteca de karité, vitamina E, aloe vera. Libre de parabenos.', 10, 210),
    ('exfoliante-manos-pies-gonails-cupcake-250ml', 'Exfoliante de manos y pies GoNails Cupcake', 'unas_manos', '250 ml', 9990, null, null, array['%pedicur%', 'Manicura Completa', '%manicur%'],
     'Exfoliante con partículas minerales que deja manos y pies suaves antes de hidratar. Aroma a cupcake.',
     'Masajea sobre la piel húmeda con movimientos circulares y enjuaga. Una o dos veces por semana, y después aplica tu crema.',
     'Con exfoliantes minerales. Libre de parabenos.', 6, 220),
    ('aceite-cuticulas-gonails-granada-30ml', 'Aceite de cutículas GoNails Granada', 'unas_manos', '30 ml', 5490, null, null, array['Manicura Completa', '%manicur%'],
     'Aceite de cutículas con aroma a granada y vitamina E. Suaviza la cutícula y da brillo a la uña entre cada visita al estudio.',
     'Una gota por uña cada noche. Masajea hasta que se absorba.',
     'Con vitamina E.', 10, 230),
    ('acondicionador-gohair-reparador-cotton-candy-400ml', 'Acondicionador reparador GoHair Cotton Candy', 'cabello', '400 ml', 10990, null, null, array['Tratamiento Capilar', '%capilar%'],
     'Acondicionador de fórmula cremosa para cabello seco y dañado, sin sal ni siliconas. Aroma a algodón de azúcar.',
     'Después del champú, aplica de medios a puntas, deja actuar unos minutos y enjuaga.',
     'Keramare y pantenol (según envase). Sin sal ni siliconas.', 4, 240),
    ('iluminador-essence-baby-got-holo-glow', 'Iluminador en barra essence Baby Got Holo Glow', 'piel', '5 g', 6990, null, null, array[]::text[],
     'Iluminador en barra con acabado holográfico. Se difumina con los dedos sobre pómulos, párpados o donde quieras sumar brillo. Vegano.',
     'Desliza la barra sobre la zona a iluminar y difumina con los dedos.',
     '', 3, 250),
    ('mascarilla-kiss-beauty-strawberry', 'Mascarilla facial Kiss Beauty Strawberry', 'piel', '20 g', 1990, null, null, array['Tratamiento Facial', '%facial%', '%limpieza%'],
     'Mascarilla de esencia de frutilla, hidratante, en sobre individual. Un rato de cuidado para la piel en casa.',
     'Sobre el rostro limpio, deja actuar el tiempo que indica el envase y retira. Masajea el exceso hasta absorber.',
     '', 15, 260),
    ('mascarilla-kiss-beauty-aloe', 'Mascarilla facial Kiss Beauty Aloe', 'piel', '20 g', 1990, null, null, array['Tratamiento Facial', '%facial%', '%limpieza%'],
     'Mascarilla de esencia de aloe vera, hidratante, en sobre individual. Un rato de cuidado para la piel en casa.',
     'Sobre el rostro limpio, deja actuar el tiempo que indica el envase y retira. Masajea el exceso hasta absorber.',
     '', 15, 270),
    ('mascarilla-kiss-beauty-orange-vc', 'Mascarilla facial Kiss Beauty Orange VC', 'piel', '20 g', 1990, null, null, array['Tratamiento Facial', '%facial%', '%limpieza%'],
     'Mascarilla de esencia de naranja con vitamina C, hidratante, en sobre individual. Un rato de cuidado para la piel en casa.',
     'Sobre el rostro limpio, deja actuar el tiempo que indica el envase y retira. Masajea el exceso hasta absorber.',
     '', 15, 280),
    ('mascarilla-kiss-beauty-grape', 'Mascarilla facial Kiss Beauty Grape', 'piel', '20 g', 1990, null, null, array['Tratamiento Facial', '%facial%', '%limpieza%'],
     'Mascarilla de esencia de uva, hidratante, en sobre individual. Un rato de cuidado para la piel en casa.',
     'Sobre el rostro limpio, deja actuar el tiempo que indica el envase y retira. Masajea el exceso hasta absorber.',
     '', 15, 290),
    ('mascarilla-kiss-beauty-bamboo-charcoal', 'Mascarilla facial Kiss Beauty Bamboo Charcoal', 'piel', '20 g', 1990, null, null, array['Tratamiento Facial', '%facial%', '%limpieza%'],
     'Mascarilla de esencia de carbón de bambú, hidratante, en sobre individual. Un rato de cuidado para la piel en casa.',
     'Sobre el rostro limpio, deja actuar el tiempo que indica el envase y retira. Masajea el exceso hasta absorber.',
     '', 15, 300),
    ('pack-mascarillas-kiss-beauty', 'Pack 5 mascarillas Kiss Beauty', 'kits', '5 × 20 g', 8990, 9950, 'kit', array['Tratamiento Facial', '%facial%', '%limpieza%'],
     'Las cinco mascarillas Kiss Beauty: frutilla, aloe, naranja con vitamina C, uva y carbón de bambú. Una para cada día de la semana laboral.',
     'Usa una mascarilla por sesión sobre el rostro limpio, siguiendo el tiempo de cada envase.',
     'Incluye Strawberry, Aloe, Orange VC, Grape y Bamboo Charcoal.', 4, 310)
) as v (slug, nombre, categoria, tamano, precio, precio_anterior, insignia, servicio,
        descripcion, modo_uso, ingredientes, stock, orden)
on conflict (slug) do nothing;

-- Comprobacion: deben salir 21 filas cargadas por este archivo.
select
  count(*)                            as productos_0021,
  count(servicio_id)                  as con_servicio,
  count(*) filter (where activo)      as activos
from public.productos
where orden between 110 and 310
  and imagen_url like '/productos/%.jpg';

-- ----------------------------------------------------------------------------
-- Rollback (manual; no se ejecuta)
-- ----------------------------------------------------------------------------
-- Se filtra por slug y no por orden/imagen_url porque el panel puede haber
-- cambiado esos dos despues.
--
-- Preferido: desactivar. Conserva el enlace de pedido_items y lo editado.
--   update public.productos set activo = false
--   where slug in (
--     'crema-manos-pies-gonails-cotton-candy-500ml',
--     'crema-manos-pies-gonails-lemon-pie-500ml',
--     'crema-manos-pies-gonails-lolipop-500ml',
--     'crema-manos-pies-gonails-popcorn-500ml',
--     'crema-manos-pies-gonails-cotton-candy-60ml',
--     'crema-manos-pies-gonails-lemon-pie-60ml',
--     'crema-manos-pies-gonails-cupcake-60ml',
--     'crema-manos-pies-gonails-watermelon-gum-60ml',
--     'crema-manos-pies-gonails-strawberry-cake-60ml',
--     'crema-manos-pies-gonails-hot-chocolate-60ml',
--     'crema-manos-pies-gonails-pistacho-caramelo-60ml',
--     'exfoliante-manos-pies-gonails-cupcake-250ml',
--     'aceite-cuticulas-gonails-granada-30ml',
--     'acondicionador-gohair-reparador-cotton-candy-400ml',
--     'iluminador-essence-baby-got-holo-glow',
--     'mascarilla-kiss-beauty-strawberry',
--     'mascarilla-kiss-beauty-aloe',
--     'mascarilla-kiss-beauty-orange-vc',
--     'mascarilla-kiss-beauty-grape',
--     'mascarilla-kiss-beauty-bamboo-charcoal',
--     'pack-mascarillas-kiss-beauty'
--   );
--
-- Borrado duro: la misma lista, y solo los que no aparezcan en ningun pedido
-- (pedido_items.producto_id es `on delete set null`; el pedido conservaria
-- nombre y precio pero perderia el enlace):
--   delete from public.productos p
--    where p.slug in (<misma lista>)
--      and not exists (select 1 from public.pedido_items i where i.producto_id = p.id);
-- ============================================================================
