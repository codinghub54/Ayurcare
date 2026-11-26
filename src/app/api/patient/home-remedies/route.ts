import { NextResponse } from 'next/server';
import remediesData from '@/app/patient/home-remedies/remedies.json';

type Remedy = (typeof remediesData)[number];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const page = parseInt(searchParams.get('page') || '1', 10) || 1;
    const limit = Math.min(48, Math.max(1, parseInt(searchParams.get('limit') || '24', 10) || 24));

    let filtered: Remedy[] = remediesData;

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.symptom.toLowerCase().includes(search) ||
          r.name.toLowerCase().includes(search) ||
          r.desc.toLowerCase().includes(search) ||
          r.ingredients.some((i) => i.toLowerCase().includes(search))
      );
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * limit;

    return NextResponse.json({
      totalCount: total,
      libraryCount: remediesData.length,
      totalPages,
      currentPage,
      limit,
      remedies: filtered.slice(startIndex, startIndex + limit),
    });
  } catch (error: any) {
    console.error('Fetch home remedies error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
