# Backnowy

Control flotante para volver al inicio con un aro que representa el progreso real del scroll.

## Qué hace

- Dibuja el progreso alrededor de una flecha hacia arriba: se llena al bajar y retrocede al subir.
- El porcentaje se calcula sobre `scrollHeight - innerHeight`, limitado entre 0 y 100%, y las lecturas del scroll se agrupan con `requestAnimationFrame`.
- Al pulsar, desplaza suavemente al inicio y muestra “Back!”.
- Respeta `prefers-reduced-motion`, funciona con teclado y comunica el progreso a tecnologías de asistencia.
- No depende de un framework ni de una librería de animación.

## Instalación en este proyecto

```js
import { mountBacknowy } from './components/backnowy.js';

const unmountBacknowy = mountBacknowy({
  onBack: () => toast('¡Back!'),
});
```

El módulo crea y administra el botón y sus listeners. Llama `unmountBacknowy()` al desmontar la página o componente para limpiar recursos. Los estilos están identificados con la clase `.backnowy` en `src/style.css`. `label` y `color` son opciones; por defecto son `Back!` y naranja.

## Prompt para futuros proyectos

> Implementa “Backnowy”: un botón circular flotante con una flecha hacia arriba y un aro SVG de progreso. El aro debe seguir el porcentaje real de scroll de la página con `scrollY / (scrollHeight - innerHeight)`, llenarse al bajar y vaciarse al subir. Agrupa actualizaciones con `requestAnimationFrame`, limita el valor entre 0 y 1, y recalcula al cambiar el tamaño de ventana. Al activarlo, anima el regreso al inicio y muestra “Back!”. Debe ser accesible (nombre para lector de pantalla, foco visible, actualización de estado sin anuncios excesivos), respetar `prefers-reduced-motion`, evitar dependencias nuevas y exponer una función de montaje con limpieza de listeners. Ajusta posición, color y dimensiones al sistema visual existente del proyecto.

## Archivos

- `src/components/backnowy.js`: función reusable `mountBacknowy()`.
- `src/style.css`: diseño responsive, aro de progreso, estados hover/focus y tooltip.
