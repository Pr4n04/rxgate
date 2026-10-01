// Controlled Drug (CD) Validation for UK/NI Veterinary Pharmacy
// Implements checks required by the Misuse of Drugs Regulations (NI) 2002

const CD_SCHEDULES = {
  'CD-SCH2': {
    label: 'Schedule 2',
    maxValidDays: 28,        // Prescription valid for 28 days
    requiresWrittenRx: true,  // Must be written prescription
    requiresSafeCustody: true,// Must be stored in CD cabinet
    maxSupplyDays: 28,        // Max 28 days supply
    recordKeeping: 'full',    // Full CD register required
  },
  'CD-SCH3': {
    label: 'Schedule 3',
    maxValidDays: 28,
    requiresWrittenRx: true,
    requiresSafeCustody: false,
    maxSupplyDays: 30,
    recordKeeping: 'minimal', // Some CDs in SCH3 don't need full register
  },
  'CD-SCH4': {
    label: 'Schedule 4',
    maxValidDays: 365,        // Valid for longer
    requiresWrittenRx: false,
    requiresSafeCustody: false,
    maxSupplyDays: 90,
    recordKeeping: 'none',
  },
  'CD-SCH5': {
    label: 'Schedule 5',
    maxValidDays: 365,
    requiresWrittenRx: false,
    requiresSafeCustody: false,
    maxSupplyDays: 365,
    recordKeeping: 'none',
  },
};

// Validate a controlled drug prescription
// @param {object} params
// @param {string} params.cdSchedule - 'CD-SCH2' through 'CD-SCH5'
// @param {string} params.prescriptionDate - Date the prescription was written (ISO string or null)
// @param {string} params.vetRegNumber - Veterinary surgeon registration number
// @param {number} [params.supplyDays] - Number of days supply being provided. If omitted, the supply-duration check is skipped and a warning is raised.
// @returns {object} { valid: boolean, warnings: string[], errors: string[] }
function validateControlledDrugPrescription({ cdSchedule, prescriptionDate, vetRegNumber, supplyDays }) {
  const errors = [];
  const warnings = [];

  if (!cdSchedule || !CD_SCHEDULES[cdSchedule]) {
    // Not a controlled drug, or unknown schedule
    return { valid: true, warnings: [], errors: [] };
  }

  const rules = CD_SCHEDULES[cdSchedule];

  // 1. Check prescription date validity
  if (prescriptionDate) {
    const rxDate = new Date(prescriptionDate);
    const now = new Date();
    const daysSincePrescribed = Math.floor((now - rxDate) / (1000 * 60 * 60 * 24));

    if (daysSincePrescribed > rules.maxValidDays) {
      errors.push(
        `Prescription is ${daysSincePrescribed} days old. Schedule ${cdSchedule} prescriptions are only valid for ${rules.maxValidDays} days.`
      );
    } else if (daysSincePrescribed > rules.maxValidDays * 0.7) {
      warnings.push(
        `Prescription is ${daysSincePrescribed} days old and expires in ${rules.maxValidDays - daysSincePrescribed} days.`
      );
    }
  } else {
    if (rules.requiresWrittenRx) {
      warnings.push(
        `Schedule ${cdSchedule} prescriptions should have a prescription date. Please confirm the date with the prescriber.`
      );
    }
  }

  // 2. Check veterinary registration (required for SCH2 and SCH3)
  if (rules.requiresWrittenRx && !vetRegNumber) {
    if (cdSchedule === 'CD-SCH2' || cdSchedule === 'CD-SCH3') {
      errors.push(
        `Veterinary surgeon registration number is required for ${cdSchedule} prescriptions.`
      );
    } else {
      warnings.push('Veterinary registration number is recommended for controlled drug prescriptions.');
    }
  }

  // 3. Check supply days.
  // Only enforce this when the caller actually states a supply. Defaulting to a
  // fixed 30 meant an otherwise-valid Schedule 2 prescription was rejected purely
  // because the field was left blank — an unspecified supply is not a known breach.
  if (supplyDays === undefined || supplyDays === null || supplyDays === '') {
    warnings.push(
      `Supply duration not specified. Confirm it is within the ${rules.maxSupplyDays}-day maximum for ${cdSchedule}.`
    );
  } else if (Number(supplyDays) > rules.maxSupplyDays) {
    errors.push(
      `Supply of ${supplyDays} days exceeds the maximum of ${rules.maxSupplyDays} days for ${cdSchedule}.`
    );
  }

  // 4. Check written prescription requirement
  if (rules.requiresWrittenRx) {
    warnings.push(
      `${cdSchedule} requires an original written prescription to be held on file. Please ensure the original is received.`
    );
  }

  // 5. Safe custody warning
  if (rules.requiresSafeCustody) {
    warnings.push(
      `${cdSchedule} requires safe custody (CD cabinet) for storage. Confirm storage compliance before dispensing.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rules: {
      schedule: cdSchedule,
      label: rules.label,
      maxValidDays: rules.maxValidDays,
      requiresWrittenRx: rules.requiresWrittenRx,
      requiresSafeCustody: rules.requiresSafeCustody,
      maxSupplyDays: rules.maxSupplyDays,
    }
  };
}

// Get human-readable CD schedule info
function getCdScheduleInfo(cdSchedule) {
  if (!cdSchedule || !CD_SCHEDULES[cdSchedule]) return null;
  const rules = CD_SCHEDULES[cdSchedule];
  return {
    code: cdSchedule,
    label: rules.label,
    requiresSafeCustody: rules.requiresSafeCustody,
    requiresWrittenRx: rules.requiresWrittenRx,
    maxValidDays: rules.maxValidDays,
    maxSupplyDays: rules.maxSupplyDays,
  };
}

function isControlledDrug(cdSchedule) {
  return cdSchedule && CD_SCHEDULES[cdSchedule] != null;
}

module.exports = {
  validateControlledDrugPrescription,
  getCdScheduleInfo,
  isControlledDrug,
  CD_SCHEDULES,
};
