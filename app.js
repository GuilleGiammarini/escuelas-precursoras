// ============================================================
// CONFIGURACIÓN
// ============================================================

const DEPARTAMENTOS = [
  "GENERAL SAN MARTIN",
  "SAN MARTIN",
  "UNION",
  "MARCOS JUAREZ",
  "MARCO JUAREZ",
  "SAN JUSTO",
  "GENERAL ROCA",
  "PRESIDENTE ROQUE SAENZ PENA"
];

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
  "Instituciones Pedagógicas (Nivel Superior de Formación Docente)",
  "SIN CLASIFICAR"
];


function obtenerClasificaciones(e) {

  const todas = Array.isArray(e.clasificacionesPrecursora)
    ? e.clasificacionesPrecursora
    : [];

  if (!todas.length) {
    return [];
  }

  const nivel = normalizar(e.nivel);

  // Las fichas de secundaria y Jóvenes y Adultos
  // se relacionan con las orientaciones de Secundaria.
  const esSecundaria =
    nivel.includes("SECUNDARIO") ||
    nivel.includes("JOVENES Y ADULTOS");

  // Las fichas de Superior se relacionan con los planes SNU.
  const esSuperior =
    nivel.includes("SUPERIOR");

  if (esSecundaria) {

    const secundarias = todas.filter(
      (c) => normalizar(c.nivel) === "SECUNDARIA"
    );

    if (secundarias.length) {
      return secundarias;
    }

  }

  if (esSuperior) {

    const snu = todas.filter(
      (c) => normalizar(c.nivel) === "SNU"
    );

    if (snu.length) {
      return snu;
    }

  }

  // Para otros casos dejamos las clasificaciones disponibles.
  return todas;
}


function obtenerCategorias(e) {

  const categorias =
    obtenerClasificaciones(e)
      .map((c) => c.categoria)
      .filter(Boolean);

  // Si la clasificación oficial indica explícitamente una
  // categoría pero no trae el detalle de clasificaciones,
  // usamos también ese campo como respaldo.
  if (!categorias.length && e.categoriaPrecursoraOficial) {
    return [e.categoriaPrecursoraOficial];
  }

  return [
    ...new Set(categorias)
  ];
}


function obtenerSubcategorias(e) {

  const subcategorias =
    obtenerClasificaciones(e)
      .map((c) => c.subcategoria)
      .filter(Boolean);

  if (!subcategorias.length && e.subcategoriaPrecursoraOficial) {
    return [e.subcategoriaPrecursoraOficial];
  }

  return [
    ...new Set(subcategorias)
  ];
}


function etiquetaCategorias(e) {

  const valores = obtenerCategorias(e);

  return valores.length
    ? valores.map(escapar).join(" · ")
    : "Sin clasificar";
}


function etiquetaSubcategorias(e) {

  const valores = obtenerSubcategorias(e);

  return valores.length
    ? valores.map(escapar).join(" · ")
    : "Revisar";
}


function obtenerTodasLasCategorias() {

  return [
    ...new Set(
      escuelas.flatMap((e) => obtenerCategorias(e))
    )
  ].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}


function obtenerTodasLasSubcategorias(categoria = "") {

  return [
    ...new Set(
      escuelas.flatMap((e) => {

        const categorias = obtenerCategorias(e);

        if (
          categoria &&
          !categorias.includes(categoria)
        ) {
          return [];
        }

        return obtenerSubcategorias(e);

      })
    )
  ].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}


function llenarSelectValores(id, valores) {

  const sel = document.getElementById(id);

  while (sel.options.length > 1) {
    sel.remove(1);
  }

  [...new Set(valores.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((v) => {
      sel.add(new Option(v, v));
    });
}


function actualizarSubcategorias() {

  const categoria =
    document.getElementById("f-categoria").value;

  llenarSelectValores(
    "f-subcategoria",
    obtenerTodasLasSubcategorias(categoria)
  );
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

      .filter((e) =>
        DEPARTAMENTOS.includes(
          normalizar(e.departamento)
        )
      )

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
      .getElementById("f-categoria")
      .addEventListener(
        "change",
        () => {

          actualizarSubcategorias();

          document.getElementById(
            "f-subcategoria"
          ).value = "";

          dibujar();
        }
      );


    document
      .getElementById("f-subcategoria")
      .addEventListener(
        "change",
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

    .forEach(
      (id) =>
        (
          document.getElementById(id).value = ""
        )
    );


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


  const categoria =
    document.getElementById(
      "f-categoria"
    ).value;


  const subcategoria =
    document.getElementById(
      "f-subcategoria"
    ).value;


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
        e.departamento === depto)

      &&

      (!nivel ||
        e.nivel === nivel)

      &&

      (!sector ||
        e.sector === sector)

      &&

      (!categoria ||
        obtenerCategorias(e).includes(categoria))

      &&

      (!subcategoria ||
        obtenerSubcategorias(e).includes(subcategoria))

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

      document.getElementById(
        id
      ).value = "";

    });


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

        const nombreDepto =
          normalizar(
            feature.properties.nombre || ""
          );


        const esValido =
          DEPARTAMENTOS.includes(
            nombreDepto
          );


        return {

          color:
            esValido
              ? "#2563eb"
              : "#cbd5e1",

          weight:
            esValido
              ? 2
              : 1,

          fillColor:
            esValido
              ? "#3b82f6"
              : "#f1f5f9",

          fillOpacity:
            esValido
              ? 0.05
              : 0.02

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

                const deptoMatch =
                  DEPARTAMENTOS.find(
                    d =>
                      normalizar(d) ===
                      normalizar(nombreDepto)
                  );


                if (deptoMatch) {

                  document.getElementById(
                    "f-depto"
                  ).value =
                    deptoMatch;


                  entrarAlDetalle();

                }

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

            document.getElementById(
              "f-depto"
            ).value =
              depto.nombre;


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