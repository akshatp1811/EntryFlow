/**
 * Generates a unique ANT-format userId, checks for collisions in Users sheet
 * @returns {string} Unique User ID
 */
function generateUserId() {
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const prefix = `ANT-${dateStr}`;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidateId = `${prefix}-${suffix}`;
    
    // Collision check
    if (!findUserById(candidateId)) {
      return candidateId;
    }
  }
  
  throw new Error("ID generation failed after 10 attempts");
}

/**
 * Registers a new user, checks for duplicate emails, and saves to Users sheet.
 * @param {Object} data - User registration details
 * @returns {Object} Result payload
 */
function registerUser(data) {
  if (!data.name || !data.email || !data.role || !data.department) {
    return { success: false, message: "All fields are required" };
  }

  // Check duplicate email
  if (findUserByEmail(data.email)) {
    return { success: false, message: "Email already registered", code: "DUPLICATE_EMAIL" };
  }

  const userId = generateUserId();
  const issuedTime = new Date().toISOString();

  // Build row (qrDriveId and qrFileUrl are empty for now)
  // Headers: userId | name | email | role | department | qrDriveId | qrFileUrl | createdAt
  const rowData = [
    userId,
    data.name,
    data.email,
    data.role,
    data.department,
    "",
    "",
    issuedTime
  ];

  appendUserRow(rowData);

  return { 
    success: true, 
    userId: userId, 
    name: data.name, 
    role: data.role,
    issued: issuedTime,
    message: "User registered successfully"
  };
}

/**
 * Decodes a base64 QR code and saves it to Google Drive as a PNG.
 * @param {Object} data - Contains userId and base64Image
 * @returns {Object} Result containing Drive URL
 */
function saveQRToDrive(data) {
  const { userId, base64Image } = data;
  if (!userId || !base64Image) {
    return { success: false, message: "Missing userId or base64Image" };
  }

  const folderId = PropertiesService.getScriptProperties().getProperty('QR_FOLDER_ID');
  if (!folderId) {
    throw new Error("QR_FOLDER_ID not set in Script Properties");
  }

  // Extract base64 data and decode
  const base64Data = base64Image.split(',')[1] || base64Image;
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    'image/png',
    userId + '.png'
  );

  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(blob);
  
  // Make publicly accessible
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  const fileUrl = file.getUrl();
  const driveId = file.getId();

  // Update Users sheet
  // Headers: userId | name | email | role | department | qrDriveId | qrFileUrl | createdAt
  // qrDriveId is column 6, qrFileUrl is column 7
  updateUserRow(userId, 6, driveId);
  updateUserRow(userId, 7, fileUrl);

  return { success: true, qrFileUrl: fileUrl, qrDriveId: driveId };
}
