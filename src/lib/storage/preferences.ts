import type { Contact, DriveFolder } from "../types";

const CONTACTS_KEY = "smartdoc:recent-contacts";
const DRIVE_FOLDER_KEY = "smartdoc:last-drive-folder";

export function getRecentContacts(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? "[]") as Contact[];
  } catch {
    return [];
  }
}

export function rememberContact(contact: Contact) {
  const list = getRecentContacts().filter((c) => c.email !== contact.email);
  list.unshift(contact);
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(list.slice(0, 12)));
}

export function getLastDriveFolder(): DriveFolder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRIVE_FOLDER_KEY);
    return raw ? (JSON.parse(raw) as DriveFolder) : null;
  } catch {
    return null;
  }
}

export function setLastDriveFolder(folder: DriveFolder) {
  localStorage.setItem(DRIVE_FOLDER_KEY, JSON.stringify(folder));
}
