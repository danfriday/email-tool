import { NextResponse } from 'next/server';
import { getContacts, addContact } from '@/lib/supabase';

export async function GET() {
  try {
    // Test reading from Supabase
    console.log('Testing Supabase connection...');
    const contacts = await getContacts();
    
    return NextResponse.json({
      success: true,
      message: 'Supabase connection OK',
      contactsCount: contacts.length,
      sampleContacts: contacts.slice(0, 3),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Supabase test error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Supabase connection failed',
      error: errorMsg,
      hint: 'Check your Supabase keys and table schema. Ensure the contacts table exists and the service role key is valid.',
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Test writing to Supabase
    console.log('Testing Supabase write...');
    const testId = await addContact({
      name: 'Test Contact',
      email: `test-${Date.now()}@example.com`,
      status: 'pending',
    });
    
    return NextResponse.json({
      success: true,
      message: 'Supabase write test successful',
      testId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Supabase write test error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Supabase write test failed',
      error: errorMsg,
      hint: 'Your Supabase permissions may be too restrictive. Ensure the service role key has access to the contacts table.',
    }, { status: 500 });
  }
}
