// 100 plausible-looking domain stems. The generator picks one and appends a
// random TLD from TLDS, optionally with a number suffix to dodge collisions
// when we mint hundreds at once.
export const DOMAIN_STEMS: readonly string[] = [
  "apexlogic", "forgeanalytics", "lumeo", "stratify", "pacificrobotics", "bwxsystems",
  "northwindcap", "beaconhealth", "cascadelabs", "quantumfoundry", "helixbio",
  "ironcladsec", "veganetworks", "stellarfreight", "anchortrust", "meridianenergy",
  "tessera", "polarismining", "crimsonind", "bluepeak", "greenfieldag", "orbitaldef",
  "latticematerials", "sigmarobotics", "cobaltcrane", "riverstonecap", "falconaero",
  "driftstudios", "hearthside", "kestrelavionics", "pinionmfg", "sabletelecom",
  "tidewaterlogistics", "vantageins", "wexlerpharma", "yarrowbot", "zenithpower",
  "anvilforge", "berylmining", "crestlinerealty", "driftwoodstudio", "embercoffee",
  "foxtrotaerial", "glacierbrew", "hollowoakdist", "indigoapparel", "junipercos",
  "kindredspirits", "larkspurmedia", "marrowbone", "nightjarrecords", "onyxtrading",
  "ploveroutfit", "quillpub", "redwoodbuild", "saltboxhotel", "tinderboxgames",
  "umbralighting", "vellumpress", "whetstonetools", "xylemplumbing", "yieldwise",
  "zirconjewel", "acornchildcare", "beacontutor", "cinderblock", "dovetailcab",
  "evergreenfh", "fjordmarine", "garrisondef", "hummingbirdcafe", "iridiumoptics",
  "jackdawantiques", "kilowattauto", "liminalarch", "mossbackoutdoors", "nautilusdiving",
  "obsidianforge", "pewterhollow", "quarrystone", "roosthospitality", "slatespruce",
  "tallowcandle", "underwoodestates", "vespertinewine", "wildcatter", "xanadutours",
  "yellowtailsushi", "zephyrsail", "anselphoto", "bramblevine", "charcoalgrill",
  "driftlessbrew", "echoparkstudios", "foundrydistrict", "goldenrodhoney", "hightowerre",
  "ironwoodfurn", "juneberryfloral", "klondikeadv", "lighthousecouns", "mockingbirdbakery",
];

export const TLDS: readonly string[] = [".com", ".io", ".co", ".ai", ".dev", ".net", ".app"];
