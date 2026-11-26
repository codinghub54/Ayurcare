import { validateDoctorDetails, PASSWORD_RULE, PASSWORD_RULE_MESSAGE, type DoctorProfileData } from '@/lib/doctor-validation';
import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'ADMIN') return null;
  return payload;
}

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const whereClause: any = {};

    if (role) {
      whereClause.role = role;
    }
    if (status) {
      whereClause.status = status;
    }
    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        doctorProfile: {
          select: {
            qualification: true,
            regNumber: true,
            specializations: true,
            experienceYears: true,
            feePerConsult: true,
            availability: true,
            isApproved: true,
            approvalStatus: true,
          },
        },
        patientProfile: {
          select: {
            dob: true,
            gender: true,
            doshaType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('Admin users get error:', error);
    return apiError(error, 'An error occurred');
  }
}

export async function POST(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { password, role, doctorDetails } = body;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : '';

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Name, email, password and role are required.' }, { status: 400 });
    }
    if (!['PATIENT', 'DOCTOR', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    if (typeof password !== 'string' || !PASSWORD_RULE.test(password)) {
      return NextResponse.json({ error: PASSWORD_RULE_MESSAGE }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 400 });
    }

    // Doctors need real professional details: nothing is invented on the server
    let doctorData: DoctorProfileData | null = null;
    if (role === 'DOCTOR') {
      const check = validateDoctorDetails(doctorDetails, { requireKyc: false });
      if ('error' in check) return NextResponse.json({ error: check.error }, { status: 400 });
      doctorData = check.data;
      const dupe = await prisma.doctorProfile.findUnique({ where: { regNumber: doctorData.regNumber } });
      if (dupe) return NextResponse.json({ error: 'This medical registration number is already registered.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          role,
          passwordHash,
          status: 'ACTIVE', // Admin-created accounts are active immediately
          emailVerified: true,
        },
      });

      if (role === 'PATIENT') {
        await tx.patientProfile.create({
          data: {
            userId: user.id,
            lifestyleData: '{}',
          },
        });
      } else if (role === 'DOCTOR' && doctorData) {
        const { fees: _fees, ...profile } = doctorData;
        await tx.doctorProfile.create({
          data: {
            userId: user.id,
            ...profile,
            // Created and checked by an administrator, so approved straight away
            isApproved: true,
            approvalStatus: 'APPROVED',
          },
        });
      }

      return user;
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.userId,
        action: 'ADMIN_CREATE_USER',
        targetUserId: newUser.id,
        metadata: JSON.stringify({ role: newUser.role, email: newUser.email }),
      },
    });

    return NextResponse.json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error: any) {
    console.error('Admin user create error:', error);
    return apiError(error, 'An error occurred');
  }
}
