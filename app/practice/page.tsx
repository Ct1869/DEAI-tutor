import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import PracticeClient from './PracticeClient';

export default async function PracticePage() {
  if (!(await getSessionUser())) redirect('/login');
  return <PracticeClient />;
}
