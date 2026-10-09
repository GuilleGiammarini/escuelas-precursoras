// ============================================================
// CONFIGURACIÓN
// ============================================================

// Se completa dinámicamente con los departamentos presentes en
// data/departamentos.json. Ya no se limita a una lista manual.
let DEPARTAMENTOS = [];

const PALETA = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#64748b"
];


// ============================================================
// AUXILIARES
// ============================================================

const normalizar = (t) =>
  (t || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();


const escapar = (t) =>
  (t || "")
    .toString()
    .replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));


const bonito = (t) =>
  (t || "")
    .toLowerCase()
    .replace(
      /(^|[\s.\-(])([a-záéíóúñ])/g,
      (m, a, b) => a + b.toUpperCase()
    );


/* ============================================================
   CLASIFICACIÓN OFICIAL DE ESCUELAS PRECURSORAS
   ============================================================

   La clasificación NO se calcula por el nombre de la institución.
   Se utiliza la clasificación generada a partir de los planes,
   orientaciones y niveles informados por la fuente oficial.

   Importante:
   una misma institución puede tener más de una orientación.
   Por eso las categorías y subcategorías se manejan como arrays.
   Además, se seleccionan las clasificaciones correspondientes
   al nivel de la ficha que estamos mostrando.
   ============================================================ */

const CATEGORIAS_PRECURSORAS = [
  "Orientaciones Técnicas y de Producción (Alimentos y Bioagroindustria)",
  "Ciencias Sociales y Humanidades",
  "Instituciones Pedagógicas (Nivel Superior de Formación Docente)"
];

// Lee tanto el esquema anterior (clasificacionesPrecursora) como
// el esquema nuevo del clasificador (planesClasificados).
function obtenerClasificaciones(e) {
  const todas = Array.isArray(e.planesClasificados)
    ? e.planesClasificados
    : Array.isArray(e.clasificacionesPrecursora)
      ? e.clasificacionesPrecursora
      : [];

  if (!todas.length) return [];

  const nivel = normalizar(e.nivel);
  const esSecundaria = nivel.includes("SECUNDARIO") || nivel.includes("JOVENES Y ADULTOS");
  const esSuperior = nivel.includes("SUPERIOR");

  if (esSecundaria) {
    const secundarias = todas.filter(c => normalizar(c.nivel) === "SECUNDARIA");
    if (secundarias.length) return secundarias;
  }
  if (esSuperior) {
    const snu = todas.filter(c => normalizar(c.nivel) === "SNU");
    if (snu.length) return snu;
  }
  return todas;
}

function valoresUnicos(valores) {
  return [...new Set((valores || []).filter(v => typeof v === "string" && v.trim()).map(v => v.trim()))];
}

function obtenerCategorias(e) {
  const desdePlanes = obtenerClasificaciones(e)
    .filter(c => normalizar(c.categoria) !== "SIN CLASIFICAR")
    .map(c => c.categoria)
    .filter(Boolean);
  if (desdePlanes.length) return valoresUnicos(desdePlanes);

  const arrays = e.categoriasPrecursorasOficiales || e.categoriasPrecursoraOficiales || e.categoriasPrecursoraOficial;
  if (Array.isArray(arrays) && arrays.length) return valoresUnicos(arrays);
  if (typeof e.categoriaPrecursoraOficial === "string" && e.categoriaPrecursoraOficial.trim() && !["MÚLTIPLE", "MULTIPLE", "SIN CLASIFICAR"].includes(normalizar(e.categoriaPrecursoraOficial))) {
    return [e.categoriaPrecursoraOficial.trim()];
  }
  return [];
}

function obtenerSubcategorias(e) {
  const desdePlanes = obtenerClasificaciones(e)
    .filter(c => normalizar(c.categoria) !== "SIN CLASIFICAR")
    .map(c => c.subcategoria)
    .filter(Boolean);
  if (desdePlanes.length) return valoresUnicos(desdePlanes);

  const arrays = e.subcategoriasPrecursorasOficiales || e.subcategoriasPrecursoraOficiales || e.subcategoriasPrecursoraOficial;
  if (Array.isArray(arrays) && arrays.length) return valoresUnicos(arrays);
  if (typeof e.subcategoriaPrecursoraOficial === "string" && e.subcategoriaPrecursoraOficial.trim() && !["MÚLTIPLE", "MULTIPLE", "REVISAR"].includes(normalizar(e.subcategoriaPrecursoraOficial))) {
    return [e.subcategoriaPrecursoraOficial.trim()];
  }
  return [];
}

function etiquetaCategorias(e) {
  const valores = obtenerCategorias(e);
  return valores.length ? valores.map(escapar).join(" · ") : "Pendiente de clasificación";
}

function etiquetaSubcategorias(e) {
  const valores = obtenerSubcategorias(e);
  return valores.length ? valores.map(escapar).join(" · ") : "Pendiente de revisión";
}

function obtenerTodasLasCategorias() {
  return [...new Set(escuelas.flatMap(e => obtenerCategorias(e)))].sort((a, b) => a.localeCompare(b, "es"));
}

function obtenerTodasLasSubcategorias(categorias = []) {
  const seleccionadas = Array.isArray(categorias) ? categorias : (categorias ? [categorias] : []);
  return [...new Set(escuelas.flatMap(e => {
    if (seleccionadas.length && !obtenerCategorias(e).some(c => seleccionadas.includes(c))) return [];
    return obtenerSubcategorias(e);
  }))].sort((a, b) => a.localeCompare(b, "es"));
}

function llenarSelectValores(id, valores) {
  const sel = document.getElementById(id);
  const seleccionados = obtenerValoresSeleccionados(id);
  while (sel.options.length > 1) sel.remove(1);
  [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")).forEach(v => {
    const option = new Option(v, v);
    option.selected = seleccionados.includes(v);
    sel.add(option);
  });
  if (MULTISELECTS[id]) actualizarOpcionesMultiSelect(id);
}

function obtenerValoresSeleccionados(id) {
  const sel = document.getElementById(id);
  if (!sel) return [];
  return [...sel.options].filter(o => o.selected && o.value).map(o => o.value);
}

function actualizarSubcategorias() {
  const categorias = obtenerValoresSeleccionados("f-categoria");
  llenarSelectValores("f-subcategoria", obtenerTodasLasSubcategorias(categorias));
}

// Convierte los dos selectores de clasificación en menús con casillas.
// Los select originales quedan ocultos como almacenamiento compatible con el resto del mapa.
const MULTISELECTS = {};

function crearMultiSelect(id, placeholder) {
  const sel = document.getElementById(id);
  if (!sel || MULTISELECTS[id]) return;

  sel.multiple = true;
  sel.setAttribute("aria-hidden", "true");
  sel.tabIndex = -1;
  sel.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "filtro-multiselect";
  wrap.dataset.filtro = id;
  wrap.style.cssText = "position:relative;width:100%;font:inherit;";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "filtro-multiselect-boton";
  button.style.cssText = "width:100%;min-height:38px;padding:9px 34px 9px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;text-align:left;font:inherit;cursor:pointer;position:relative;";
  button.setAttribute("aria-expanded", "false");

  const flecha = document.createElement("span");
  flecha.textContent = "▾";
  flecha.style.cssText = "position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#64748b;";
  button.appendChild(flecha);

  const menu = document.createElement("div");
  menu.className = "filtro-multiselect-menu";
  menu.style.cssText = "display:none;position:absolute;z-index:1200;top:calc(100% + 4px);left:0;right:0;max-height:260px;overflow:auto;padding:8px;background:#fff;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 10px 25px rgba(15,23,42,.16);";

  const acciones = document.createElement("div");
  acciones.style.cssText = "display:flex;gap:8px;justify-content:space-between;padding:2px 2px 8px;margin-bottom:5px;border-bottom:1px solid #e2e8f0;";
  const marcar = document.createElement("button");
  marcar.type = "button"; marcar.textContent = "Seleccionar todas";
  const borrar = document.createElement("button");
  borrar.type = "button"; borrar.textContent = "Quitar selección";
  [marcar, borrar].forEach(b => b.style.cssText = "border:0;background:transparent;color:#2563eb;font-size:12px;cursor:pointer;padding:3px;");
  acciones.append(marcar, borrar);
  menu.appendChild(acciones);

  const opciones = document.createElement("div");
  menu.appendChild(opciones);
  wrap.append(button, menu);
  sel.insertAdjacentElement("afterend", wrap);

  MULTISELECTS[id] = { sel, wrap, button, menu, opciones, placeholder };

  button.addEventListener("click", () => {
    const abrir = menu.style.display === "none";
    Object.entries(MULTISELECTS).forEach(([otroId, cfg]) => {
      if (otroId !== id) { cfg.menu.style.display = "none"; cfg.button.setAttribute("aria-expanded", "false"); }
    });
    menu.style.display = abrir ? "block" : "none";
    button.setAttribute("aria-expanded", String(abrir));
  });

  marcar.addEventListener("click", () => {
    [...sel.options].forEach(o => { if (o.value) o.selected = true; });
    manejarCambioMultiSelect(id);
  });
  borrar.addEventListener("click", () => {
    [...sel.options].forEach(o => { o.selected = false; });
    manejarCambioMultiSelect(id);
  });

  actualizarOpcionesMultiSelect(id);
}

function actualizarOpcionesMultiSelect(id) {
  const cfg = MULTISELECTS[id];
  if (!cfg) return;
  const { sel, button, opciones, placeholder } = cfg;
  const seleccionados = obtenerValoresSeleccionados(id);
  const texto = seleccionados.length === 0
    ? placeholder
    : seleccionados.length === 1
      ? seleccionados[0]
      : `${seleccionados.length} opciones seleccionadas`;
  button.textContent = texto;
  const flecha = document.createElement("span");
  flecha.textContent = "▾";
  flecha.style.cssText = "position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#64748b;";
  button.appendChild(flecha);

  opciones.innerHTML = "";
  [...sel.options].filter(o => o.value).forEach(option => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:flex-start;gap:8px;padding:7px 5px;border-radius:5px;cursor:pointer;color:#334155;font-size:13px;line-height:1.35;";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = option.selected;
    check.value = option.value;
    check.style.cssText = "margin-top:2px;accent-color:#2563eb;flex-shrink:0;";
    check.addEventListener("change", () => {
      option.selected = check.checked;
      manejarCambioMultiSelect(id);
    });
    label.append(check, document.createTextNode(option.textContent));
    opciones.appendChild(label);
  });
  if (!opciones.children.length) {
    const vacio = document.createElement("div");
    vacio.textContent = "No hay opciones disponibles";
    vacio.style.cssText = "padding:8px;color:#64748b;font-size:12px;";
    opciones.appendChild(vacio);
  }
}

function manejarCambioMultiSelect(id) {
  actualizarOpcionesMultiSelect(id);
  if (id === "f-categoria") {
    actualizarSubcategorias();
    actualizarOpcionesMultiSelect("f-subcategoria");
  }
  dibujar();
}


// ============================================================
// MAPA
// ============================================================

const mapa = L.map("mapa", {
  zoomControl: false
}).setView([-32.4, -62.8], 8);

L.control.zoom({
  position: "bottomright"
}).addTo(mapa);


// ============================================================
// MAPA BASE
// ============================================================

L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
  }
).addTo(mapa);


// ============================================================
// CAPAS
// ============================================================

const capa = L.layerGroup().addTo(mapa);

const capaMascara = L.layerGroup().addTo(mapa);

const capaProvincia = L.layerGroup().addTo(mapa);

const capaDepartamentos = L.layerGroup().addTo(mapa);

const marcadores = new Map();

let escuelas = [];

let colores = {};

let vista = "resumen";
// "resumen" = burbujas por departamento
// "detalle"  = puntos individuales


// ============================================================
// ICONO DE ESCUELA
// ============================================================

const icono = (color) =>
  L.divIcon({
    className: "pin",

    html: `
      <span style="background:${color}"></span>
    `,

    iconSize: [20, 20],

    iconAnchor: [10, 10],

    popupAnchor: [0, -12]
  });


// ============================================================
// MÁSCARA EXTERIOR DE CÓRDOBA
// ============================================================
//
// PROVINCIA_CBA_GEOJSON viene de:
// data/data_provincia.js
//
// GeoJSON utiliza:
// [longitud, latitud]
//
// Leaflet utiliza:
// [latitud, longitud]
//
// Por eso convertimos las coordenadas.
// ============================================================

function convertirCoordenadasParaLeaflet(ring) {

  return ring.map(([lon, lat]) => [
    lat,
    lon
  ]);

}


function crearMascaraProvincia() {

  // Verificamos que el archivo de provincia exista.
  if (
    typeof PROVINCIA_CBA_GEOJSON === "undefined"
  ) {

    console.error(
      "No se encontró PROVINCIA_CBA_GEOJSON. " +
      "Verificá que data/data_provincia.js esté cargado antes de app.js."
    );

    return;

  }


  const geometry =
    PROVINCIA_CBA_GEOJSON.features[0].geometry;


  if (
    !geometry ||
    geometry.type !== "MultiPolygon"
  ) {

    console.error(
      "La geometría de Córdoba no tiene el formato MultiPolygon esperado."
    );

    return;

  }


  // Tomamos el primer polígono y su anillo exterior.
  //
  // Estructura:
  //
  // coordinates
  //   └── polygon
  //       └── ring
  //           └── [lon, lat]
  //
  const anilloProvincia =
    geometry.coordinates[0][0];


  const limiteCordoba =
    convertirCoordenadasParaLeaflet(anilloProvincia);


  // ==========================================================
  // RECTÁNGULO EXTERIOR
  // ==========================================================
  //
  // Este rectángulo representa todo el mundo visible.
  // La provincia será utilizada como "agujero".
  //

  const mundo = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180]
  ];


  // ==========================================================
  // MÁSCARA
  // ==========================================================
  //
  // Primer anillo = todo el mundo
  // Segundo anillo = Córdoba
  //
  // Resultado:
  // negro fuera de Córdoba
  // transparente dentro de Córdoba
  //

  const mascara = L.polygon(
    [
      mundo,
      limiteCordoba
    ],
    {
      color: "#000000",

      weight: 0,

      opacity: 0,

      fillColor: "#000000",

      fillOpacity: 1,

      fillRule: "evenodd",

      interactive: false
    }
  );


  mascara.addTo(capaMascara);


  // ==========================================================
  // LÍMITE PROVINCIAL
  // ==========================================================

  const limiteProvincia =
    L.geoJSON(
      PROVINCIA_CBA_GEOJSON,
      {
        style: {
          color: "#ffffff",

          weight: 2.5,

          opacity: 1,

          fill: false,

          fillOpacity: 0,

          interactive: false
        }
      }
    );


  limiteProvincia.addTo(capaProvincia);

}


// ============================================================
// CARGA DE DATOS
// ============================================================

Promise.all([

  fetch("data/escuelas_enriquecidas_clasificadas.json")
    .then((r) => r.json()),

  fetch("data/departamentos.json")
    .then((r) => r.json())
    .catch(() => null)

])

  .then(([datosEscuelas, datosDeptos]) => {

    // Tomar todos los departamentos desde el GeoJSON actualizado.
    DEPARTAMENTOS = (datosDeptos?.features || [])
      .map((feature) => feature?.properties?.nombre)
      .filter(Boolean);

    // ========================================================
    // ESCUELAS
    // ========================================================

    const NIVELES_EXCLUIDOS = [
      "Educación Especial y Hospitalaria",
      "Nivel Inicial",
      "Nivel Primario"
    ];

    escuelas = datosEscuelas

      .filter((e) =>
        e &&
        e.nombre
      )

      .filter((e) =>
        e.isPrecursora === true
      )

      // No restringir por una lista fija de departamentos.
      // Así se incluyen las escuelas de todos los departamentos
      // presentes en el JSON de datos.

      .filter((e) =>
        typeof e.lat === "number" &&
        typeof e.lon === "number"
      )

      // 👉 Omitir los niveles que no querés mostrar
      .filter((e) => {
        const nivelLimpio = (e.nivel || "").trim();
        return !NIVELES_EXCLUIDOS.includes(nivelLimpio);
      })

      .map((e) => ({
        ...e,

        nivel:
          (e.nivel || "").trim() ||
          "Sin especificar",

        categoriasPrecursoraOficial:
          obtenerCategorias(e),

        subcategoriasPrecursoraOficial:
          obtenerSubcategorias(e),

        categoriaPrecursora:
          obtenerCategorias(e).length === 1
            ? obtenerCategorias(e)[0]
            : "MÚLTIPLE",

        subcategoriaPrecursora:
          obtenerSubcategorias(e).length === 1
            ? obtenerSubcategorias(e)[0]
            : "MÚLTIPLE"
      }));


    // ========================================================
    // COLORES POR NIVEL
    // ========================================================

    [
      ...new Set(
        escuelas
          .map((e) => e.nivel)
      )
    ]

      .sort()

      .forEach((n, i) => {

        colores[n] =
          PALETA[
            i % PALETA.length
          ];

      });


    // ========================================================
    // FILTROS
    // ========================================================

    llenarSelect(
      "f-depto",
      "departamento"
    );

    // Agregar también los departamentos del GeoJSON aunque todavía
    // no tengan escuelas precursoras en el conjunto de datos.
    agregarDepartamentosAlFiltro(DEPARTAMENTOS);

    llenarSelect(
      "f-nivel",
      "nivel"
    );

    llenarSelect(
      "f-sector",
      "sector"
    );

    llenarSelectValores(
      "f-categoria",
      obtenerTodasLasCategorias()
    );

    actualizarSubcategorias();

    crearMultiSelect("f-categoria", "Categorías principales");
    crearMultiSelect("f-subcategoria", "Subcategorías");
    actualizarOpcionesMultiSelect("f-categoria");
    actualizarOpcionesMultiSelect("f-subcategoria");

    llenarSelect(
      "f-anio",
      "precursoraYear"
    );


    armarLeyenda();


    // ========================================================
    // CAPAS GEOGRÁFICAS
    // ========================================================

    // Primero la máscara de Córdoba.
    crearMascaraProvincia();


    // Después los departamentos.
    if (datosDeptos) {

      dibujarLimitesDepartamentos(
        datosDeptos
      );

    }


    // ========================================================
    // EVENTOS
    // ========================================================

    document
      .getElementById("buscar")
      .addEventListener(
        "input",
        () => dibujar()
      );




    document
      .getElementById("limpiar")
      .addEventListener(
        "click",
        limpiar
      );


    document
      .getElementById("btn-resumen")
      .addEventListener(
        "click",
        volverAlResumen
      );


    // ========================================================
    // PRIMER DIBUJADO
    // ========================================================

    dibujar();

  })

  .catch((err) => {

    console.error(
      "Error al cargar los recursos de datos:",
      err
    );

  });


// ============================================================
// FILTROS Y LEYENDA
// ============================================================

function agregarDepartamentosAlFiltro(departamentos) {
  const select = document.getElementById("f-depto");
  if (!select) return;

  (departamentos || [])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((nombre) => {
      const existe = Array.from(select.options).some(
        (opcion) => opcion.value && normalizar(opcion.value) === normalizar(nombre)
      );

      if (!existe) {
        select.add(new Option(nombre, nombre));
      }
    });
}

function seleccionarDepartamento(nombre) {
  const select = document.getElementById("f-depto");
  if (!select || !nombre) return;

  let opcion = Array.from(select.options).find(
    (item) => item.value && normalizar(item.value) === normalizar(nombre)
  );

  if (!opcion) {
    opcion = new Option(nombre, nombre);
    select.add(opcion);
  }

  select.value = opcion.value;
}

function llenarSelect(id, campo) {

  const sel =
    document.getElementById(id);


  [
    ...new Set(
      escuelas
        .map((e) => e[campo])
        .filter(Boolean)
    )
  ]

    .sort()

    .forEach((v) => {

      sel.add(
        new Option(v, v)
      );

    });


  sel.addEventListener(
    "change",
    () => dibujar()
  );

}


function armarLeyenda() {

  document.getElementById(
    "leyenda"
  ).innerHTML =

    Object.entries(colores)

      .map(
        ([nivel, color]) => `
          <span>
            <i style="background:${color}"></i>
            ${escapar(nivel)}
          </span>
        `
      )

      .join("");

}


function limpiar() {

  document.getElementById(
    "buscar"
  ).value = "";


  [
    "f-depto",
    "f-nivel",
    "f-sector",
    "f-categoria",
    "f-subcategoria",
    "f-anio"
  ]

    .forEach((id) => {
      const sel = document.getElementById(id);
      if (id === "f-categoria" || id === "f-subcategoria") {
        [...sel.options].forEach(o => { o.selected = false; });
        actualizarOpcionesMultiSelect(id);
      } else {
        sel.value = "";
      }
    });

  actualizarSubcategorias();
  actualizarOpcionesMultiSelect("f-subcategoria");
  dibujar();

}


function filtrar() {

  const depto =
    document.getElementById(
      "f-depto"
    ).value;


  const nivel =
    document.getElementById(
      "f-nivel"
    ).value;


  const sector =
    document.getElementById(
      "f-sector"
    ).value;


  const categorias = obtenerValoresSeleccionados("f-categoria");
  const subcategorias = obtenerValoresSeleccionados("f-subcategoria");


  const anio =
    document.getElementById(
      "f-anio"
    ).value;


  const texto =
    normalizar(
      document.getElementById(
        "buscar"
      ).value
    );


  return escuelas.filter(
    (e) =>

      (!depto ||
        normalizar(e.departamento) === normalizar(depto))

      &&

      (!nivel ||
        e.nivel === nivel)

      &&

      (!sector ||
        e.sector === sector)

      &&

      (!categorias.length ||
        obtenerCategorias(e).some(c => categorias.includes(c)))

      &&

      (!subcategorias.length ||
        obtenerSubcategorias(e).some(s => subcategorias.includes(s)))

      &&

      (!anio ||
        e.precursoraYear === anio)

      &&

      (!texto ||
        normalizar(
          `${e.nombre} ${e.localidad} ${e.departamento} ${e.domicilio} ${e.cue}`
        ).includes(texto))
  );

}


// ============================================================
// CAMBIO DE VISTA
// ============================================================

function entrarAlDetalle() {

  vista = "detalle";

  dibujar();

}


function volverAlResumen() {

  vista = "resumen";


  // Limpiar búsqueda y filtros.
  document.getElementById(
    "buscar"
  ).value = "";


  [
    "f-depto",
    "f-nivel",
    "f-sector",
    "f-categoria",
    "f-subcategoria",
    "f-anio"
  ]

    .forEach((id) => {

      const sel = document.getElementById(id);
      if (id === "f-categoria" || id === "f-subcategoria") {
        [...sel.options].forEach(o => { o.selected = false; });
        actualizarOpcionesMultiSelect(id);
      } else {
        sel.value = "";
      }

    });

  actualizarSubcategorias();
  actualizarOpcionesMultiSelect("f-subcategoria");
  mapa.closePopup();

  dibujar();

}


// ============================================================
// LÍMITES DE DEPARTAMENTOS
// ============================================================

function dibujarLimitesDepartamentos(
  geoJsonData
) {

  L.geoJSON(
    geoJsonData,
    {

      style: function (feature) {

        // Todos los departamentos del GeoJSON se muestran con
        // el mismo estilo, sin depender de una lista fija.
        return {
          color: "#2563eb",
          weight: 2,
          opacity: 1,
          fillColor: "#3b82f6",
          fillOpacity: 0.05
        };

      },


      onEachFeature:
        function (feature, layer) {

          const nombreDepto =
            feature.properties.nombre || "";


          layer.on({

            mouseover:
              function (e) {

                e.target.setStyle({
                  weight: 3,
                  fillOpacity: 0.15
                });

              },


            mouseout:
              function (e) {

                capaDepartamentos
                  .resetStyle(e.target);

              },


            click:
              function () {

                seleccionarDepartamento(nombreDepto);
                entrarAlDetalle();

              }

          });

        }

    }

  ).addTo(
    capaDepartamentos
  );

}


// ============================================================
// DIBUJAR ELEMENTOS DEL MAPA
// ============================================================

function dibujar({
  ajustar = true
} = {}) {

  const visibles =
    filtrar();


  capa.clearLayers();

  marcadores.clear();


  document.getElementById(
    "contador"
  ).textContent =
    visibles.length;


  document.getElementById(
    "btn-resumen"
  ).hidden =
    vista !== "detalle";


  armarLista(visibles);


  if (!visibles.length) {
    return;
  }


  const limites =
    L.latLngBounds(
      visibles.map(
        (e) => [
          e.lat,
          e.lon
        ]
      )
    );


  if (vista === "resumen") {

    dibujarResumenPorDepartamento(
      visibles,
      limites
    );

  }

  else {

    dibujarPuntos(
      visibles
    );


    if (ajustar) {

      mapa.flyToBounds(
        limites.pad(0.15),
        {
          maxZoom: 14,
          duration: 0.9
        }
      );

    }

  }

}


// ============================================================
// RESUMEN POR DEPARTAMENTO
// ============================================================

function dibujarResumenPorDepartamento(
  visibles,
  limitesGenerales
) {

  mapa.fitBounds(
    limitesGenerales.pad(0.2),
    {
      maxZoom: 9,
      animate: false
    }
  );


  const deptosMap = {};


  visibles.forEach(
    e => {

      const deptoKey =
        e.departamento ||
        "SIN DEPARTAMENTO";


      if (!deptosMap[deptoKey]) {

        deptosMap[deptoKey] = {

          nombre:
            deptoKey,

          escuelas: [],

          latSuma: 0,

          lonSuma: 0

        };

      }


      deptosMap[
        deptoKey
      ].escuelas.push(e);


      deptosMap[
        deptoKey
      ].latSuma += e.lat;


      deptosMap[
        deptoKey
      ].lonSuma += e.lon;

    }
  );


  Object.values(
    deptosMap
  ).forEach(
    depto => {

      const total =
        depto.escuelas.length;


      const latCentro =
        depto.latSuma /
        total;


      const lonCentro =
        depto.lonSuma /
        total;


 const burbujaDepto =
        L.divIcon({

          className:
            "burbuja-wrap",

          html: `
            <div class="burbuja depto-burbuja">

              <strong>
                ${total}
              </strong>

              <span>
                ${bonito(depto.nombre)}
              </span>

              <small>
                Clic para explorar
              </small>

            </div>
          `,

          iconSize:
            [75, 75],    // Cambiado de [110, 110] a [75, 75]

          iconAnchor:
            [37, 37]     // Mitad exacta de iconSize (75 / 2 = 37)

        });


      L.marker(
        [
          latCentro,
          lonCentro
        ],
        {
          icon:
            burbujaDepto,

          keyboard:
            true,

          title:
            `Ver ${depto.nombre}`
        }
      )

        .on(
          "click",
          () => {

            seleccionarDepartamento(depto.nombre);
            entrarAlDetalle();

          }
        )

        .addTo(capa);

    }
  );

}


// ============================================================
// PUNTOS DE ESCUELAS
// ============================================================

function dibujarPuntos(
  visibles
) {

  visibles.forEach(
    e => {

      const m =
        L.marker(
          [
            e.lat,
            e.lon
          ],
          {
            icon:
              icono(
                colores[e.nivel]
              )
          }
        )

          .bindPopup(
            popup(e),
            {
              maxWidth: 280
            }
          )

          .addTo(capa);


      marcadores.set(
        e.id,
        m
      );

    }
  );

}


// ============================================================
// POPUP
// ============================================================

function popup(e) {

  return `
    <div class="popup">

      <h3>
        ${escapar(
          bonito(e.nombre)
        )}
      </h3>

      <div class="etiquetas">

        <span
          class="tag"
          style="background:${colores[e.nivel]}"
        >
          ${escapar(e.nivel)}
        </span>

        <span class="tag gris">
          ${escapar(e.sector)}
        </span>

        <span class="tag gris">
          ${etiquetaCategorias(e)}
        </span>

        <span class="tag gris">
          ${etiquetaSubcategorias(e)}
        </span>

        <span class="tag gris">
          Desde ${escapar(e.precursoraYear)}
        </span>

      </div>

      <p>
        <strong>
          ${escapar(
            bonito(e.localidad)
          )}
        </strong>

        ·

        ${escapar(
          bonito(e.departamento)
        )}
      </p>

      <p>
        ${escapar(
          bonito(e.domicilio)
        )}
      </p>

      <p>
        CUE ${escapar(e.cue)}
      </p>

    </div>
  `;

}


// ============================================================
// LISTA LATERAL
// ============================================================

function armarLista(
  visibles
) {

  const ul =
    document.getElementById(
      "lista"
    );


  if (!visibles.length) {

    ul.innerHTML = `
      <li class="vacio">
        No hay establecimientos con esos filtros.
      </li>
    `;

    return;

  }


  const ordenadas =
    [...visibles].sort(
      (a, b) =>
        (a.localidad || "").localeCompare(
          b.localidad || "",
          "es"
        ) ||

        (a.nombre || "").localeCompare(
          b.nombre || "",
          "es"
        )
    );


  ul.innerHTML =
    ordenadas

      .map(
        (e) => `

          <li data-id="${escapar(e.id)}">

            <span
              class="punto"
              style="background:${colores[e.nivel]}"
            ></span>

            <div>

              <div class="nombre">
                ${escapar(
                  bonito(e.nombre)
                )}
              </div>

              <div class="meta">
                ${escapar(
                  bonito(e.localidad)
                )}
                ·
                ${escapar(e.nivel)}
              </div>

            </div>

          </li>

        `
      )

      .join("");


  ul.querySelectorAll(
    "li[data-id]"
  )

    .forEach(
      (li) => {

        li.addEventListener(
          "click",
          () => {

            const e =
              ordenadas.find(
                (x) =>
                  x.id ===
                  li.dataset.id
              );


            if (!e) {
              return;
            }


            vista =
              "detalle";


            dibujar({
              ajustar: false
            });


            const m =
              marcadores.get(
                e.id
              );


            document
              .getElementById(
                "mapa"
              )
              .scrollIntoView({
                behavior:
                  "smooth",

                block:
                  "start"
              });


            mapa.flyTo(
              [
                e.lat,
                e.lon
              ],
              15,
              {
                duration:
                  0.8
              }
            );


            if (m) {
              m.openPopup();
            }

          }
        );

      }
    );

}