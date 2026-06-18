import { redirect } from 'next/navigation';

// The admin dashboard lives at /admin; send the root there.
export default function RootPage() {
  redirect('/admin');
}
