import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import TutorClient from './TutorClient';

export default async function TutorPage() {
  if (!(await getSessionUser())) redirect('/login');
  return <TutorClient />;
}
