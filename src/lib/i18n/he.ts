import type { DocType } from "@/lib/types";

/** Hebrew UI copy for SmartDoc */
export const he = {
  appName: "SmartDoc",
  phase: "שלב 2",
  home: {
    badge: "זיהוי AI · למידת 3 אישורים",
    title: "סרקו. למדו. תייקו לבד.",
    subtitle:
      "אחרי כל סריקה, הבינה המלאכותית מסווגת את המסמך. אשרו תיקייה שלוש פעמים — ומאותו רגע SmartDoc יתייק את אותו ספק אוטומטית.",
    startScan: "התחלת סריקה",
    featureClassify: "סיווג AI",
    featureClassifyBody:
      "GPT-4o / Gemini / Claude מזהים ספק, סוג מסמך והצעת תיקייה בעברית.",
    featureRoute: "ניתוב חכם",
    featureRouteBody:
      "תיקייה קיימת, חדשה, או בחירה ידנית — כל אישור מלמד את הזיכרון.",
    featureStrike: "אוטומציה ב־3 אישורים",
    featureStrikeBody: "באישור השלישי התיוק הופך אוטומטי לגמרי.",
  },
  scanner: {
    title: "סורק",
    upload: "העלאת מסמך / תמונה",
    processing: "מעבד…",
    cancel: "ביטול",
    dragCorners: "גררו את הפינות לתיקון פרספקטיבה",
    preview: "תצוגה מקדימה",
    retake: "צילום מחדש",
    addPage: "הוספת עמוד",
    session: "סשן",
    page: "עמוד",
    pages: "עמודים",
    saveContinue: "שמירת הסריקה והמשך",
    openFailed: "לא ניתן לפתוח את הקובץ",
    pdfEmpty: "ה־PDF ריק או ללא עמודים",
  },
  camera: {
    starting: "מפעיל מצלמה…",
    denied:
      "אין גישה למצלמה. אשרו הרשאה, או העלו מסמך / תמונה.",
    retry: "ניסיון חיבור מחדש למצלמה",
    flip: "החלפה",
    capture: "צילום",
    edge: "קצה",
  },
  filters: {
    original: "מקורי",
    magic: "צבע קסם",
    grayscale: "גווני אפור",
    sharp: "חדות",
  },
  classify: {
    analyzing: "מנתח את המסמך…",
    analyzingSub: "סיווג AI וחיפוש בזיכרון הלמידה",
    failed: "הסיווג נכשל",
    lookupFailed: "חיפוש הכלל נכשל",
  },
  routing: {
    title: (docType: string, vendor: string) =>
      `זיהינו מסמך מסוג ${docType} של ${vendor}. איפה לתייק אותו?`,
    confidence: (pct: number, summary: string) =>
      `${pct}% ביטחון · ${summary}`,
    memory: (count: number) =>
      `זיכרון למידה: אישור ${count} מתוך 3 לקראת תיוק אוטומטי`,
    optionCreate: (name: string) => `פתיחת תיקייה חדשה בשם: ${name}`,
    optionExisting: (name: string) => `תיוק בתיקייה הקיימת: ${name}`,
    optionManual: "בחירת תיקייה ידנית / שליחה במייל",
    filing: "מתייק…",
  },
  toasts: {
    autoFiled: (folder: string) =>
      `🤖 תויק אוטומטית ל־${folder} (כלל 3 האישורים פעיל)`,
    successCount: (count: number) =>
      `📌 המסמך תויק בהצלחה! (אישור ${count} מתוך 3 ללמידה אוטומטית)`,
    learned: (vendor: string) =>
      `🎉 הכלל נלמד! מעכשיו מסמכי ${vendor} יתוייקו לשם באופן אוטומטי`,
    filingFailed: "התיוק נכשל",
  },
  actions: {
    scanReady: "הסריקה מוכנה",
    pagesLabel: (n: number, format: string) =>
      `${n} ${n === 1 ? "עמוד" : "עמודים"} · ${format.toUpperCase()}`,
    saveDrive: "שמירה ב-Google Drive",
    saveDriveHint: "בחירת תיקייה — ברירת מחדל: השורש או האחרונה שבשימוש.",
    sendEmail: "שליחה במייל",
    sendEmailHint: "השלמה אוטומטית מנמענים אחרונים ואנשי קשר.",
    downloadLocal: "הורדה למחשב",
    anotherAction: "פעולה נוספת",
    done: "סיום",
    back: "חזרה",
    downloaded: (name: string) => `הורד: ${name}`,
    savedTo: (folder: string, name: string) => `נשמר ב־${folder}: ${name}`,
    emailSent: (to: string) => `נשלח אל ${to}`,
    exportFailed: "הייצוא נכשל",
    uploadFailed: "ההעלאה נכשלה",
    sendFailed: "השליחה נכשלה",
  },
  drive: {
    loading: "טוען תיקיות…",
    loadError: "לא ניתן לטעון תיקיות מ־Drive.",
    filename: "שם קובץ",
    uploading: "מעלה…",
    saveTo: (name: string) => `שמירה ב־${name}`,
    lastUsed: "בשימוש לאחרונה",
    root: "הכונן שלי (שורש)",
  },
  email: {
    to: "אל",
    subject: "נושא",
    message: "הודעה",
    placeholder: "recipient@company.com",
    defaultBody: "מצורף המסמך שסרקתי.",
    defaultSubject: (base: string) => `מסמך סרוק — ${base}`,
    sending: "שולח…",
    send: "שליחה במייל",
  },
  docTypes: {
    Invoice: "חשבונית",
    Receipt: "קבלה",
    Bill: "חשבון",
    Contract: "חוזה",
    ID: "תעודה",
    Other: "אחר",
  } satisfies Record<DocType, string>,
} as const;

export function docTypeHe(docType: DocType | string): string {
  return (
    he.docTypes[docType as DocType] ?? String(docType)
  );
}
