/* Exemple de punts (obra de cuina, portes i armaris). Es carrega amb el botó «Amb l'exemple» en crear una obra. */
window.TEMPLATE_SECTIONS = [
  { title: "Lavadero", items: [
    { t: "Aixeta i pica del lavadero", s: "pro",
      q: "Grifo i pica del lavadero.",
      a: "Ok, tenim una triada que fa 50cm de ample x 45cm. Entenc que ens cap bé no? Si ens dones l’ok ja lagafem. Va en lo grifo també així ja ho tindríem tot.",
      n: "Ivan confirma que la pica de 50 x 45 cm hi cap i ens dona l'ok.", who: "Confirmar que la pica de 50 x 45 cm hi cap i donar l'ok" },
    { t: "Granit", s: "pro",
      q: "Granit que et vas fer la foto i li volies ensenyar a Laia.",
      a: "Haviem pensat en algo del estil que tenvio la foto, a ver com ho veus.",
      n: "Ivan ens diu què li sembla.", who: "Dir què li sembla el granit de la foto" },
    { t: "Rumba (forat sota el moble)", s: "client",
      q: "Rumba que vos trieu per fer-li el hueco a baix del moble.",
      a: "Ok ho mirem.",
      n: "Nosaltres triem la rumba i li ho diem.", who: "Triar la rumba per al forat sota el moble" },
    { t: "Tornar a mesurar", s: "client",
      q: "Em de tornar a medir quan estigue enmanissat o enguixat, no se com va?",
      a: "Va enguixat, i ja hi esta, però falta ficar el pladur del texo. Quan estigui tavisem si vols.",
      n: "Nosaltres l'avisem quan estigui posat el pladur.", who: "Avisar Ivan quan estigui el pladur" },
    { t: "Mobles i tiradors", s: "pro",
      q: "Els mobles anirán en interior blanc de 16mm i exterior en Bohemian blanco que es el que vareu elegir. Falta triar els tiradors.",
      a: "Ok, ens pots passar foto dels tiradors si vols i triem.",
      n: "Ivan ens envia fotos dels tiradors i nosaltres triem.", who: "Enviar-nos fotos dels tiradors dels mobles" }
  ]},
  { title: "Portes", items: [
    { t: "Pressupost actualitzat", s: "info",
      q: "Et passo el pressupost actualitzat.", a: "", n: "", who: "" },
    { t: "Ferratges", s: "done",
      q: "Tambe confirma'm que els ferratges son en negre.",
      a: "Si ferratges en negre també", n: "", who: "" },
    { t: "Manetes", s: "client",
      q: "Falta ensenyar-te les manetes, ja estan comptades unes de modernetes en negre pero es poden posar altres si no ho veus be.",
      a: "passam foto de les manetes que hem ficat i així te dic si avant o si les volem canviar",
      n: "Nosaltres enviem la foto de les manetes. Després decidim si es queden o es canvien.", who: "Enviar foto de les manetes" },
    { t: "Tiradors de les portes corredisses", s: "pro",
      q: "Ensenyar-te els tiradors de les portes correderes interiors, ja que les exteriors no en porten.",
      a: "No entenc que vol dir que les exteriors no en porten?",
      n: "Ivan ens explica què vol dir amb «les exteriors no en porten».", who: "Explicar què vol dir que les corredisses exteriors no en porten" }
  ]},
  { title: "Lavabos", items: [
    { t: "Pressupost dels lavabos", s: "pro",
      q: "Queda pendent passar-te el pressupost.", a: "",
      n: "Ivan ens passa el pressupost.", who: "Passar-nos el pressupost dels lavabos" },
    { t: "CH-2: alçada fins al sostre", s: "open",
      q: "També mirar del CH-2 definir alçada fins a sostre que vam dir que si.", a: "",
      n: "Ningú ha contestat aquest punt.", who: "Definir i respondre l'alçada fins al sostre del CH-2" },
    { t: "Color de l'exterior i tiradors", s: "pro",
      q: "Color de l'exterior (Portes i Tapetes). Triar Tiradors. Les tapetes i portes aniràn enrrassades.",
      a: "Si ens pots passar fotos de exemples de color i tiradors per triar",
      n: "Ivan ens envia fotos d'exemples de color i de tiradors.", who: "Enviar fotos d'exemples de color i tiradors (portes i tapetes)" }
  ]},
  { title: "Armari del rebedor", items: [
    { t: "Distribució i color", s: "client",
      q: "Part dreta Sabater tot en lleixes i dalt Maletero. Part esquerra penjador baix 1 lleixa i dalt Maletero. Sense portes tot vist tipus vestidor. Color?",
      a: "De dins en blanc. Per fora hi va una porta tipus Màgic 2, invisible, que Ivan ja coneix. Hem de triar quina fusta volem per a aquesta porta. Un cop oberta, entres a l'armari i a dins no hi ha portes.",
      n: "Nosaltres triem la fusta de la porta Màgic 2 invisible.", who: "Triar la fusta de la porta Màgic 2 invisible de l'armari del rebedor" }
  ]},
  { title: "Cuina", items: [
    { t: "Rentaplats, aixeta i pica", s: "client",
      q: "Marca i Model Rentaplats. Marca i Model Grifo. Marca i model Pica.",
      a: "Ens ho mirem esta setmana i et passem referencies",
      n: "Nosaltres enviem marca i model dels tres aquesta setmana.", who: "Enviar marca i model de rentaplats, aixeta i pica (aquesta setmana)" }
  ]},
  { title: "Electrodomèstics i pagaments", items: [
    { t: "Electrodomèstics que serveix el taller", s: "info",
      q: "Electrodomestic que et servim nosaltres: Els demananem.", a: "", n: "", who: "" },
    { t: "Campana i vitro de 3 focs", s: "done",
      q: "Campana i Vitro 3 Focs (Et passo el pressupost de la diferencia de 4 a 3 focs).",
      a: "ok avant, vitro 3 focs", n: "", who: "" },
    { t: "Factures a compte (A/C)", s: "open",
      q: "Tambe et passo les factures de A/c per a ingressar de tot el que tenim acceptat i no em fet A/c.", a: "",
      n: "Ningú ha contestat aquest punt.", who: "Revisar les factures A/C i fer els ingressos" },
    { t: "Quedar un dia al taller", s: "open",
      q: "Be Jordi i Laia ja m'aneu contestan i mirem de quedar un dia aqui al taller per verure les coses en viu. Gracies.", a: "",
      n: "Ningú ha contestat aquest punt.", who: "Proposar un dia per anar al taller" }
  ]}
];
