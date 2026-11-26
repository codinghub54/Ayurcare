import { apiError, PublicError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { sendOtpEmail } from '@/lib/email';
import { validateDoctorDetails, PASSWORD_RULE, PASSWORD_RULE_MESSAGE, type DoctorProfileData } from '@/lib/doctor-validation';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password, role, doctorDetails } = body;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : '';

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Please fill in your name, email and password.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (role !== 'PATIENT' && role !== 'DOCTOR') {
      return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
    }

    // Validate doctor details up front so nothing is created for an invalid application
    let doctorData: DoctorProfileData | null = null;
    if (role === 'DOCTOR') {
      const check = validateDoctorDetails(doctorDetails, { requireKyc: true });
      if ('error' in check) return NextResponse.json({ error: check.error }, { status: 400 });
      doctorData = check.data;
      const existingLicense = await prisma.doctorProfile.findUnique({ where: { regNumber: doctorData.regNumber } });
      if (existingLicense) {
        return NextResponse.json({ error: 'This medical registration number is already registered.' }, { status: 409 });
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      if (existingUser.emailVerified === false) {
        // Clean up unverified, half-created registration from previous failed attempts
        await prisma.user.delete({
          where: { id: existingUser.id },
        });
      } else {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
      }
    }

    // Password strength check (8+ chars, at least one number and symbol)
    if (typeof password !== 'string' || !PASSWORD_RULE.test(password)) {
      return NextResponse.json({ error: PASSWORD_RULE_MESSAGE }, { status: 400 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user & profile in a transaction
    const user = await prisma.$transaction(async (tx: any) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          phone,
          role,
          status: 'PENDING', // Start as pending (either pending OTP for patients or pending Admin vetting for doctors)
          emailVerified: role === 'DOCTOR' ? true : false,
        },
      });

      if (role === 'PATIENT') {
        await tx.patientProfile.create({
          data: {
            userId: newUser.id,
            lifestyleData: '{}',
          },
        });
      } else if (role === 'DOCTOR' && doctorData) {
        const { fees: _fees, ...profile } = doctorData;
        await tx.doctorProfile.create({
          data: {
            userId: newUser.id,
            ...profile,
            isApproved: false,
            approvalStatus: 'PENDING',
          },
        });
      }

      return newUser;
    });

    if (role === 'DOCTOR') {
      // Create system log
      await prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'USER_REGISTER',
          metadata: JSON.stringify({ role, email }),
        },
      });

      return NextResponse.json({
        message: 'Registration successful. Profile is pending admin vetting.',
        userId: user.id,
      });
    }

    // Generate 6-digit OTP (for PATIENTs)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Save OTP
    await prisma.otpVerification.create({
      data: {
        userId: user.id,
        code: otpCode,
        purpose: 'SIGNUP',
        expiresAt,
      },
    });

    // Send email
    await sendOtpEmail(email, otpCode);

    // Create system log
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'USER_REGISTER',
        metadata: JSON.stringify({ role, email }),
      },
    });

    return NextResponse.json({
      message: 'Registration successful. OTP sent to your email.',
      userId: user.id,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return apiError(error, 'An error occurred during registration');
  }
}
