import { registerPlugin, Capacitor } from "@capacitor/core";

export type DriveScannerOpenResult = {
  mode: "drive_scan_intent" | "drive_app" | "play_store";
  action?: string;
  message?: string;
};

export type DriveScannerScanResult = {
  mimeType: string;
  pageCount: number;
  base64: string;
  fileName: string;
};

export type DriveScannerAvailability = {
  native: boolean;
  driveInstalled: boolean;
  mlKitReady: boolean;
};

type DriveScannerPlugin = {
  isNativeAvailable(): Promise<DriveScannerAvailability>;
  openDriveScanner(): Promise<DriveScannerOpenResult>;
  scanDocument(): Promise<DriveScannerScanResult>;
};

const DriveScanner = registerPlugin<DriveScannerPlugin>("DriveScanner");

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export { DriveScanner };
