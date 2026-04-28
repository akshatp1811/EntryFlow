/**
 * Retrieves the Users sheet from the configured Google Spreadsheet.
 * @returns {Sheet} Users sheet object
 */
function getUsersSheet() {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SHEET_ID')
  );
  return ss.getSheetByName('Users');
}

/**
 * Retrieves the Logs sheet from the configured Google Spreadsheet.
 * @returns {Sheet} Logs sheet object
 */
function getLogsSheet() {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SHEET_ID')
  );
  return ss.getSheetByName('Logs');
}

/**
 * Finds a user by their unique ID.
 * @param {string} userId - ID to search
 * @returns {Object|null} User data and row number
 */
function findUserById(userId) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return { rowNum: i + 1, data: data[i] };
    }
  }
  return null;
}

/**
 * Finds a user by their email.
 * @param {string} email - Email to search
 * @returns {Object|null} User data and row number
 */
function findUserByEmail(email) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const lowerEmail = email.toLowerCase();
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === lowerEmail) {
      return { rowNum: i + 1, data: data[i] };
    }
  }
  return null;
}

/**
 * Appends a new user row to the Users sheet.
 * @param {Array} rowArray - Data array to append
 */
function appendUserRow(rowArray) {
  getUsersSheet().appendRow(rowArray);
}

/**
 * Updates a specific cell in the Users sheet.
 * @param {string} userId - Target user ID
 * @param {number} colIndex - Column index (1-based)
 * @param {any} value - Value to set
 */
function updateUserRow(userId, colIndex, value) {
  const user = findUserById(userId);
  if (user) {
    const sheet = getUsersSheet();
    sheet.getRange(user.rowNum, colIndex).setValue(value);
  }
}

/**
 * Retrieves the most recent log entry for a specific user.
 * @param {string} userId - Target user ID
 * @returns {Object|null} Log object or null
 */
function getLastLogForUser(userId) {
  const sheet = getLogsSheet();
  const data = sheet.getDataRange().getValues();

  // Skip header row, collect all rows for this user
  const userLogs = data
    .slice(1)
    .filter(row => row[1] === userId);  // col index 1 = userId

  if (userLogs.length === 0) return null;

  // Sort by scannedAt descending, return most recent
  userLogs.sort((a, b) => new Date(b[5]) - new Date(a[5]));

  return {
    logId:     userLogs[0][0],
    userId:    userLogs[0][1],
    name:      userLogs[0][2],
    role:      userLogs[0][3],
    status:    userLogs[0][4],
    scannedAt: userLogs[0][5]
  };
}

/**
 * Appends a new log entry to the Logs sheet.
 * @param {Object} logData - Log object to append
 */
function appendLog(logData) {
  getLogsSheet().appendRow([
    logData.logId,
    logData.userId,
    logData.name,
    logData.role,
    logData.status,
    logData.scannedAt
  ]);
}
