const express = require("express");
const path = require("path");
const fs = require("fs");
const sass = require("sass");
const pg = require("pg");
const sharp = require("sharp");

app = express();
app.set("view engine", "ejs");

obGlobal = {
    obErori: null,
    obImagini: null,
    folderScss: path.join(__dirname, "resurse/scss"),
    folderCss: path.join(__dirname, "resurse/css"),
    folderBackup: path.join(__dirname, "backup"),
}

console.log("Folder index.js", __dirname);
console.log("Folder curent (de lucru)", process.cwd()); // nu e echivalent cu __dirname, __dirname il cauta pe index.js, cwd cauta folderul in care suntem)
console.log("Cale fisier", __filename);

/*client = new pg.Client({
    database:"mi_2026",
    user:"mihnea",
    password:"crimmy",
    host:"localhost",
    port:8080
})

client.connect()*/

app.use("/resurse", express.static(path.join(__dirname, "resurse")));
app.use("/dist", express.static(path.join(__dirname, "node_modules/bootstrap/dist")));

let vect_foldere = ["temp", "logs", "backup", "fisiere_uploadate"]
for (let folder of vect_foldere) {
    let caleFolder = path.join(__dirname, folder);
    if (!fs.existsSync(caleFolder)) {
        fs.mkdirSync(path.join(caleFolder), { recursive: true });
    }
}




app.get("/favicon.ico", function (req, res) {
    res.sendFile(path.join(__dirname, "resurse/imagini/ico/favicon.ico"))
});

app.get(["/", "/index", "/home"], function (req, res) {
    //res.sendFile(path.join(__dirname, "index.html"));
    res.render("pagini/index", {
        ip: req.ip,
        imagini: obGlobal.obImagini.imagini
    });
});

app.get("/despre", function (req, res) {
    res.render("pagini/despre");
});

app.get(["/gallery", "/galerie"], function (req, res) {
    res.render("pagini/gallery", {
        imagini: obGlobal.obImagini.imagini
    });
});

//FUNCTIA BONUS!!!!!!!!
function validareFisiereErori(caleFisier) {
    let valid = true;
    //1. Verificarea ca exista erori.json
    if (!fs.existsSync(caleFisier)) {
        console.error(`FATAL ERROR: Fisierul "${caleFisier}" nu exista. Aplicatia se va opri.`);
        process.exit(1);
    }
    let rawData;
    try {
        rawData = fs.readFileSync(caleFisier, "utf-8");
    } catch (err) {
        console.error(`ERROR: Nu s-a putut citi fiserul "${err.message}"`);
        process.exit(1);
    }
    let erori;
    try {
        erori = JSON.parse(rawData);
    } catch (err) {
        console.error(`ERROR: JSON invalid "${err.message}"`);
    }
    //2. Verificarea proprietatilor
    const requiredProp = ["info_erori", "cale_baza", "eroare_default"];
    for (const prop of requiredProp) {
        if (!erori.hasOwnProperty(prop)) {
            console.error(`ERROR: Proprietatea obligatorie "${prop}" lipseste din erori.json.`);
            valid = false;
        }
    }
    if (!erori.info_erori || !erori.cale_baza || !erori.eroare_default) {
        console.error(`ERROR: Nu se pot face validari suplimentare din cauza lipsei unei proprietati de baza.`);
        return false;
    }
    //3. Verificarea erorii default
    const def = erori.eroare_default;
    const requiredDef = ["titlu", "text", "imagine"];
    for (const prop of requiredDef) {
        if (!def.hasOwnProperty(prop)) {
            console.error(`ERROR: Eroare default nu are proprietatea "${prop}"`);
            valid = false;
        }
    }
    //4. Verificarea existentei folderului cale_baza
    const caleBazaAbsoluta = path.resolve(erori.cale_baza);
    if (!fs.existsSync(caleBazaAbsoluta)) {
        console.error(`ERROR: Folderul specificat in cale_baza (${erori.cale_baza}) nu exista pe disc.`);
        valid = false;
    }
    //5. Nu exista vreunul din fisierele imagine asociate erorilor
    function verificareImagine(imagineRel, context) {
        if (!imagineRel) {
            console.error(`ERROR: ${context} - imagine lipsa.`);
            valid = false;
            return;
        }
        const caleImg = path.join(caleBazaAbsoluta, imagineRel);
        if (!fs.existsSync(caleImg)) {
            console.error(`ERROR: Imaginea "${imagineRel}" (cale completa: ${caleImg}) nu exista. ${context}`);
            valid = false;
        }
    }
    if (def.imagine) {
        verificareImagine(def.imagine, "Eroarea default");
    }
    if (Array.isArray(erori.info_erori)) {
        for (let i = 0; i < erori.info_erori.length; i++) {
            const er = erori.info_erori[i];
            const context = `Eroarea cu identificatorul "${er.identificator}"`;
            if (er.imagine) {
                verificareImagine(er.imagine, context);
            } else {
                console.error(`ERROR: ${context} nu are proprietatea "imagine".`);
                valid = false;
            }
        }
    } else {
        console.error(`ERROR: "info_erori" nu este un vector.`);
        valid = false;
    }
}

function initErori() {
    let continut = fs.readFileSync(path.join(__dirname, "resurse/json/erori.json")).toString("utf-8");
    const caleFisier = path.join(__dirname, "resurse/json/erori.json");
    let isValid = validareFisiereErori(caleFisier);
    if (!isValid) {
        console.warn("Datele din erori.json nu sunt complet valide...");
    }
    let erori = obGlobal.obErori = JSON.parse(continut)
    let err_default = erori.eroare_default
    err_default.imagine = path.join(erori.cale_baza, err_default.imagine)
    for (let eroare of erori.info_erori) {
        eroare.imagine = path.join(erori.cale_baza, eroare.imagine)
    }

}
initErori()


function afisareEroare(res, identificator, titlu, text, imagine) {
    let eroare = obGlobal.obErori.info_erori.find((elem) =>
        elem.identificator == identificator
    )
    let errDefault = obGlobal.obErori.eroare_default;
    if (eroare?.status)
        res.status(eroare.identificator)
    res.render("pagini/eroare", {
        imagine: imagine || eroare?.imagine || errDefault.imagine,
        titlu: titlu || eroare?.titlu || errDefault.titlu,
        text: text || eroare?.text || errDefault.text,
    });

}

function initImagini() {
    var continut = fs.readFileSync(path.join(__dirname, "resurse/json/galerie.json")).toString("utf-8");

    obGlobal.obImagini = JSON.parse(continut);
    let vImagini = obGlobal.obImagini.imagini;
    let caleGalerie = obGlobal.obImagini.cale_galerie

    let caleAbs = path.join(__dirname, caleGalerie);
    let caleAbsMediu = path.join(caleAbs, "mediu");
    if (!fs.existsSync(caleAbsMediu))
        fs.mkdirSync(caleAbsMediu);

    for (let imag of vImagini) {
        [numeFis, ext] = imag.fisier.split("."); //"ceva.png" -> ["ceva", "png"]
        let caleFisAbs = path.join(caleAbs, imag.fisier);
        let caleFisMediuAbs = path.join(caleAbsMediu, numeFis + ".webp");
        sharp(caleFisAbs).resize(300).toFile(caleFisMediuAbs);
        imag.fisier_mediu = path.join("/", caleGalerie, "mediu", numeFis + ".webp")
        imag.fisier = path.join("/", caleGalerie, imag.fisier)

    }
    // console.log(obGlobal.obImagini)
}
initImagini();

function compileazaScss(caleScss, caleCss) {
    if (!caleCss) {

        let numeFisExt = path.basename(caleScss, path.extname(caleScss)); // "folder1/folder2/a.b.scss" -> "a.b"
        caleCss = numeFisExt + ".css"; // a.b.css
    }

    if (!path.isAbsolute(caleScss))
        caleScss = path.join(obGlobal.folderScss, caleScss)
    if (!path.isAbsolute(caleCss))
        caleCss = path.join(obGlobal.folderCss, caleCss)

    let caleBackup = path.join(obGlobal.folderBackup, "resurse/css");
    if (!fs.existsSync(caleBackup)) {
        fs.mkdirSync(caleBackup, { recursive: true })
    }

    // la acest punct avem cai absolute in caleScss si  caleCss

    let numeFisCss = path.basename(caleCss);
    if (fs.existsSync(caleCss)) {
        fs.copyFileSync(caleCss, path.join(obGlobal.folderBackup, "resurse/css", numeFisCss) + "_" + (new Date()).getTime())
    }
    rez = sass.compile(caleScss, { "sourceMap": true });
    fs.writeFileSync(caleCss, rez.css)

}

vFisiere = fs.readdirSync(obGlobal.folderScss);
for (let numeFis of vFisiere) {
    if (path.extname(numeFis) == ".scss") {
        compileazaScss(numeFis);
    }
}


fs.watch(obGlobal.folderScss, function (eveniment, numeFis) {
    if (eveniment == "change" || eveniment == "rename") {
        let caleCompleta = path.join(obGlobal.folderScss, numeFis);
        if (fs.existsSync(caleCompleta)) {
            compileazaScss(caleCompleta);
        }
    }
})

app.get("/eroare", function (req, res) {
    afisareEroare(res, 404, "Titlu!!!")
});

app.use(function (req, res) { //app.get('*') imi dadea crash la nodemon...
    console.log("Cale pagina", req.url);
    if (req.url.startsWith("/resurse") && path.extname(req.url) == "") {
        afisareEroare(res, 403);
        return;
    }
    if (path.extname(req.url) == ".ejs") {
        afisareEroare(res, 400);
        return;
    }
    let viewName;
    if (req.url === '/' || req.url === '') {
        viewName = "pagini/index";
    }
    else {
        viewName = "pagini" + req.url;
    }
    try {
        res.render(viewName, function (eroare, rezultatRandare) {
            if (eroare) {
                if (eroare.message.includes("Failed to lookup view")) {
                    afisareEroare(res, 404)
                }
                else {
                    afisareEroare(res);
                }
            }
            else {
                res.send(rezultatRandare);
            }
        });
    }
    catch (err) {
        if (err.message.includes("Cannot find module")) {
            afisareEroare(res, 404)
        }
        else {
            afisareEroare(res);
        }
    }
});







app.listen(8081); // ca prostul, cand am instalat pgadmin, i-am pus portul 8080 (de ce? fiindca aparent am creier de bustean)
// acum nu stiu cum sa-l schimb, deci de acum incolo doar vom fi pe localhost 8081 si cu asta basta
//jumatate de ora pe prostia asta ...
console.log("Serverul a pornit!");