/**
 * Handles incoming scan events, checking duplicates, toggling status, and logging.
 * @param {Object} data - The scanned payload
 * @returns {Object} Result object with status
 */
function handleScan(data) {
  // Guard: called with no args when run directly from the editor
  if (!data) return { status: "INVALID", message: "No scan data provided" };

  const { userId, name, role, issued } = data;

  // Step 1: Validate payload
  if (!userId || !name || !role || !issued) {
    return { status: "INVALID", message: "Malformed scan payload" };
  }
  const idPattern = /^ANT-\d{8}-[A-Z0-9]{4}$/;
  if (!idPattern.test(userId)) {
    return { status: "INVALID", message: "Malformed scan payload" };
  }

  // Step 2: Look up user in Users sheet
  const user = findUserById(userId);
  if (!user) {
    return { status: "INVALID", message: "User not registered in system" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    // Step 3: Duplicate scan guard
    const lastLog = getLastLogForUser(userId);
    const now = new Date();
    if (lastLog) {
      const lastScanTime = new Date(lastLog.scannedAt);
      if ((now - lastScanTime) < 8000) {
        return { status: "DUPLICATE", message: "Scan registered too quickly. Please wait." };
      }
    }

    // Step 4: IN/OUT detection
    let newStatus = "IN";
    if (lastLog) {
      newStatus = lastLog.status === "IN" ? "OUT" : "IN";
    }

    // Step 5: Generate logId
    const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd");
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomSuffix = '';
    for (let i = 0; i < 6; i++) {
      randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const logId = `LOG-${dateStr}-${randomSuffix}`;

    // Step 6: Write to Logs sheet
    appendLog({
      logId: logId,
      userId: userId,
      name: name,
      role: role,
      status: newStatus,
      scannedAt: now.toISOString()
    });

    // Step 7: Return response
    return { 
      status: newStatus, 
      userId: userId, 
      name: name, 
      role: role,
      timestamp: now.toISOString(), 
      message: newStatus === "IN" ? "Welcome, " + name : "Goodbye, " + name
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds a test user to the Users sheet.
 * Run this ONCE before running testHandleScan().
 */
function addTestUser() {
  appendUserRow([
    "ANT-20240101-AB12",      // userId
    "John Doe",               // name
    "john@example.com",       // email
    "Employee",               // role
    "Engineering",            // department
    "",                       // qrDriveId
    "",                       // qrFileUrl
    new Date().toISOString()  // createdAt
  ]);
  Logger.log("Test user added successfully.");
}

/**
 * Test function — run this from the Apps Script editor to simulate a scan.
 * Make sure to run addTestUser() first if the Users sheet is empty.
 */
function testHandleScan() {
  const mockData = {
    userId: "ANT-20240101-AB12",
    name:   "John Doe",
    role:   "Employee",
    issued: "2024-01-01"
  };

  const result = handleScan(mockData);
  Logger.log(JSON.stringify(result));
}