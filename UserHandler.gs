
/**
 * Registers a new user in the Users sheet.
 * @param {Object} params - Registration payload
 * @returns {Object} Result object
 */
function registerUser(params) {
  const { name, email, role, department } = params;

  if (!name || !email || !role || !department) {
    return { success: false, message: "Missing required fields" };
  }

  // Check for duplicate email
  const existing = findUserByEmail(email);
  if (existing) {
    return { success: false, code: "DUPLICATE_EMAIL", message: "Email already registered" };
  }

  // Generate userId: ANT-YYYYMMDD-XXXX
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const chars   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix    = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const userId  = `ANT-${dateStr}-${suffix}`;
  const issued  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  appendUserRow([
    userId,
    name,
    email,
    role,
    department,
    '',   // qrDriveId — filled later by saveQRToDrive
    '',   // qrFileUrl — filled later by saveQRToDrive
    new Date().toISOString()
  ]);

  return { success: true, userId, name, role, department, issued };
}

/**
 * Saves a base64 QR code image to Google Drive and updates the user row.
 * @param {Object} params - { userId, base64Image }
 * @returns {Object} Result object
 */
function saveQRToDrive(params) {
  const { userId, base64Image } = params;

  if (!userId || !base64Image) {
    return { success: false, message: "Missing userId or image data" };
  }

  try {
    // Decode base64 — strip data URI prefix if present
    const base64Data = base64Image.replace(/^data:image\/png;base64,/, '');
    const decoded    = Utilities.base64Decode(base64Data);
    const blob       = Utilities.newBlob(decoded, 'image/png', `${userId}.png`);

    // Save to the designated QR codes Drive folder
    const QR_FOLDER_ID = '1B1U8E01vyIrdYB-JTMvh-IvF8-f-1NsY';
    const folder  = DriveApp.getFolderById(QR_FOLDER_ID);
    const file    = folder.createFile(blob);
    const fileId  = file.getId();
    const fileUrl = file.getUrl();

    // Make the file publicly viewable
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Update user row columns 6 (qrDriveId) and 7 (qrFileUrl)
    updateUserRow(userId, 6, fileId);
    updateUserRow(userId, 7, fileUrl);

    return { success: true, fileId, fileUrl };

  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Generates a QR code image server-side and returns it as a base64 data URL.
 * Called from the client via google.script.run — avoids CDN/CSP issues entirely.
 * @param {string} jsonPayload - JSON string to encode in the QR
 * @returns {string} base64 PNG data URL
 */
function generateQRBase64(jsonPayload) {
  const encodedData = encodeURIComponent(jsonPayload);
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=png&ecc=H&data=' + encodedData;

  const response = UrlFetchApp.fetch(url);
  const blob = response.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());

  return 'data:image/png;base64,' + base64;
}

/**
 * Client-callable wrapper for saveQRToDrive.
 * Called via google.script.run.saveQRFromClient(params)
 * @param {Object} params - { userId, base64Image }
 * @returns {Object} Result object
 */
function saveQRFromClient(params) {
  return saveQRToDrive(params);
}