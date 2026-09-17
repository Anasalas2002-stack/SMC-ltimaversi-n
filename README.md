# HabitBox

Habit tracker con fondo negro y colores vivos. Permite crear hábitos ilimitados, registrarlos día a día y ver el progreso en una cuadrícula tipo mapa de calor.

## Funcionalidad

- **Feed de hábitos**: lista de tarjetas, una por hábito, con su color, icono y una cuadrícula de los últimos días.
- **Agregar hábitos**: botón `+` flotante abre un formulario con nombre, descripción opcional, icono y color.
- **Registro diario**: toca el círculo de la tarjeta (o el botón en el detalle) para marcar el hábito como hecho hoy. Toca cualquier cuadrito del historial para alternar ese día puntual.
- **Detalle por hábito**: cuadrícula ampliable (semana / mes / año), racha actual, días desde el inicio, total de completados y días perdidos.
- **Eliminar hábitos** desde la vista de detalle.
- Todo se guarda en `localStorage`, sin necesidad de backend ni conexión.

## Cómo ejecutarla

Es una app estática (HTML/CSS/JS puro, sin build). Basta con abrir `index.html` en el navegador, o servirla localmente:

```bash
python3 -m http.server 8000
```

y visitar `http://localhost:8000`.

## Estructura

```
index.html     Estructura de las vistas (feed, detalle, modal)
css/style.css  Tema oscuro y estilos
js/app.js      Lógica de hábitos, rachas y persistencia en localStorage
```
