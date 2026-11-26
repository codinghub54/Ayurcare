/**
 * Server-side validation for doctor details, shared by self sign-up
 * (/api/auth/register) and admin creation (/api/admin/users).
 */
import { validateFees, availabilityWithFees, lowestFee, type ConsultFees } from '@/lib/doctor-fees';

/** Same rule as the sign-up forms: 8+ characters, a number and any symbol. */
export const PASSWORD_RULE = /^(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include a number and a symbol.';

const MAX_DOCUMENT_CHARS = 3_500_000; // ~2.5 MB file once base64-encoded
const MAX_PHOTO_CHARS = 1_000_000;

export interface DoctorProfileData {
  qualification: string;
  regNumber: string;
  specializations: string;
  experienceYears: number;
  feePerConsult: number;
  availability: string;
  clinicAddress: string;
  languages: string;
  bio: string | null;
  documents: string;
  aadhaarNumber: string | null;
  faceIdImage: string | null;
  fees: ConsultFees;
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * @param requireKyc true for self sign-up (documents, Aadhaar and photo are
 *   mandatory); false for admin-created doctors (optional, admin can add later).
 */
export function validateDoctorDetails(
  input: unknown,
  { requireKyc }: { requireKyc: boolean }
): { data: DoctorProfileData } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Doctor details are required.' };
  const d = input as Record<string, unknown>;

  const qualification = text(d.qualification, 120);
  if (!qualification) return { error: 'Please select the highest qualification.' };

  const regNumber = text(d.regNumber, 60);
  if (!regNumber) return { error: 'Medical registration number is required.' };

  const specializations = text(d.specializations, 300);
  if (!specializations) return { error: 'Please enter at least one area of specialisation.' };

  const experienceYears = Number(d.experienceYears);
  if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 70) {
    return { error: 'Years of experience must be a whole number between 0 and 70.' };
  }

  const feeCheck = validateFees(d.fees);
  if ('error' in feeCheck) return { error: feeCheck.error };

  const documents = typeof d.documents === 'string' ? d.documents : '';
  if (documents.length > MAX_DOCUMENT_CHARS) return { error: 'The credential document is too large. Please upload a file under 2 MB.' };
  if (documents && !/^data:(application\/pdf|image\/(png|jpe?g));base64,/.test(documents)) {
    return { error: 'Credential document must be a PDF, JPG or PNG.' };
  }

  const aadhaarRaw = typeof d.aadhaarNumber === 'string' ? d.aadhaarNumber.replace(/\s/g, '') : '';
  if (aadhaarRaw && !/^\d{12}$/.test(aadhaarRaw)) return { error: 'Aadhaar number must be exactly 12 digits.' };

  const faceIdImage = typeof d.faceIdImage === 'string' ? d.faceIdImage : '';
  if (faceIdImage.length > MAX_PHOTO_CHARS) return { error: 'The identity photo is too large.' };
  if (faceIdImage && !/^data:image\/(png|jpe?g);base64,/.test(faceIdImage)) return { error: 'Identity photo must be a JPG or PNG.' };

  if (requireKyc) {
    if (!documents) return { error: 'Please upload your licence or degree certificate.' };
    if (!aadhaarRaw) return { error: 'Aadhaar number is required for identity verification.' };
    if (!faceIdImage) return { error: 'Please add a photo of your face for identity verification.' };
  }

  return {
    data: {
      qualification,
      regNumber,
      specializations,
      experienceYears,
      fees: feeCheck.fees,
      feePerConsult: lowestFee(feeCheck.fees) ?? 0,
      availability: availabilityWithFees(null, feeCheck.fees),
      clinicAddress: text(d.clinicAddress, 300),
      languages: text(d.languages, 200) || 'English, Hindi',
      bio: text(d.bio, 2000) || null,
      documents,
      aadhaarNumber: aadhaarRaw || null,
      faceIdImage: faceIdImage || null,
    },
  };
}
