import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { validateFees, availabilityWithFees, availabilityWithSchedule, lowestFee } from '@/lib/doctor-fees';

async function verifyDoctor() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'DOCTOR') return null;
  return payload;
}

export async function GET() {
  try {
    const doctor = await verifyDoctor();
    if (!doctor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: doctor.userId },
      include: { doctorProfile: true },
    });

    return NextResponse.json({ user });
  } catch (error: any) {
    return apiError(error, 'An error occurred');
  }
}

export async function PUT(request: Request) {
  try {
    const doctor = await verifyDoctor();
    if (!doctor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, phone, qualification, specializations, experienceYears, bio, fees, clinicAddress, languages, availability } = body;

    // Fees per consultation type are validated before anything is written
    let cleanFees: ReturnType<typeof validateFees> | null = null;
    if (fees !== undefined) {
      cleanFees = validateFees(fees);
      if ('error' in cleanFees) return NextResponse.json({ error: cleanFees.error }, { status: 400 });
    }
    const current = await prisma.doctorProfile.findUnique({ where: { userId: doctor.userId }, select: { availability: true } });
    if (!current) return NextResponse.json({ error: 'Doctor profile not found.' }, { status: 404 });

    const updated = await prisma.$transaction(async (tx: any) => {
      // Update User details
      const userUpdate: any = {};
      if (name) userUpdate.name = name;
      if (phone !== undefined) userUpdate.phone = phone;

      await tx.user.update({
        where: { id: doctor.userId },
        data: userUpdate,
      });

      // Update Doctor Profile
      const profileUpdate: any = {};
      if (qualification) profileUpdate.qualification = qualification;
      if (specializations) profileUpdate.specializations = specializations;
      if (experienceYears !== undefined) profileUpdate.experienceYears = parseInt(experienceYears);
      if (bio !== undefined) profileUpdate.bio = bio;
      if (clinicAddress !== undefined) profileUpdate.clinicAddress = clinicAddress;
      if (languages !== undefined) profileUpdate.languages = languages;
      // availability JSON holds both the weekly schedule and the fees; merge so one never wipes the other
      let availabilityJson = current.availability;
      if (availability !== undefined && availability && typeof availability === 'object') {
        availabilityJson = availabilityWithSchedule(availabilityJson, availability);
      }
      if (cleanFees && 'fees' in cleanFees) {
        availabilityJson = availabilityWithFees(availabilityJson, cleanFees.fees);
        profileUpdate.feePerConsult = lowestFee(cleanFees.fees) ?? 0;
      }
      if (availabilityJson !== current.availability) profileUpdate.availability = availabilityJson;

      const profile = await tx.doctorProfile.update({
        where: { userId: doctor.userId },
        data: profileUpdate,
      });

      return profile;
    });

    return NextResponse.json({
      message: 'Profile updated successfully',
      profile: updated,
    });
  } catch (error: any) {
    console.error('Doctor profile update error:', error);
    return apiError(error, 'An error occurred');
  }
}
