# Checkpoint - Cerebro MLOps

Fecha: 2026-04-18

## Estado actual

La app `cerebro_mlops.jsx` quedo montada como una app React/Vite ejecutable localmente.

URL local usada:

```text
http://127.0.0.1:5173/
```

Comando para volver a levantarla desde esta carpeta:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Comando de validacion:

```powershell
npm.cmd run build
```

## Archivos principales

- `cerebro_mlops.jsx`: componente principal y toda la UI.
- `src/main.jsx`: wrapper React y adaptador `window.storage` hacia `localStorage`.
- `index.html`: entrada Vite.
- `package.json`: scripts y dependencias.

## Funciones agregadas

- Persistencia local usando `localStorage`.
- Seccion visible `Completado`.
- Cerebro visual con nodos por tema y ranking de profundidad.
- Puntos de esfuerzo por tema.
- Tiempo estimado por tema.
- Fecha objetivo por tema.
- Orden global por reciente, profundidad, esfuerzo, menor tiempo y fecha objetivo.
- Resumen por seccion: puntos, horas y cantidad de fechas.
- Exportar backup JSON.
- Importar backup JSON.
- Importar temas en lote.

## Backup de datos

Los temas creados dentro de la app se guardan en el navegador, no en un archivo del proyecto.

Para guardar un respaldo:

1. Abrir la app.
2. Click en `Exportar backup`.
3. Guardar el archivo `cerebro-mlops-backup-YYYY-MM-DD.json`.

Para restaurar:

1. Abrir la app.
2. Click en `Importar backup`.
3. Seleccionar el archivo JSON exportado.
4. Confirmar la importacion.

La importacion reemplaza el tablero actual.

## Ideas pendientes

- Editar titulo de cada tema.
- Notas por tema.
- Links por tema.
- Tags reales por tema.
- Filtros por vencidos, hoy, proximos 7 dias y sin fecha.
- Exportar CSV.
- Bitacora de cambios.
