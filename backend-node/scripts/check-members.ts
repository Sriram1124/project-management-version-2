import { prisma } from '../src/lib/prisma';

const targetEmails = [
  // 1. AMS-LMS
  'krish.jain@dailoqa.com', 'akshat.awasthi@dailoqa.com', 'ashish.rai@dailoqa.com',
  'manisha.parihar@dailoqa.com', 'ananya.jain@dailoqa.com', 'aditi.gupta@dailoqa.com',
  'akansha.attri@dailoqa.com', 'keshav.gupta@dailoqa.com',
  // 2. PerforMax
  'jatin.maurya@dailoqa.com', 'Akshat.bansal@dailoqa.com', 'jasleen.kaur@dailoqa.com',
  'jayesh.kansal@dailoqa.com', 'Bhavya.bhutani@dailoqa.com', 'tanvi.kad@dailoqa.com',
  'Aditya.sen@dailoqa.com', 'anushka.khare@dailoqa.com',
  // 3. PMS-CORE
  's.n.chawande@dailoqa.com', 'd.a.kumar@dailoqa.com', 'nikhil.s.manam@dailoqa.com',
  'ayush.v.panicker@dailoqa.com', 'khushal.n.g@dailoqa.com', 'v.n.kanishka@dailoqa.com',
  // 4. PRMS
  'k.s.naveen@dailoqa.com', 'j.c.sai@dailoqa.com', 'keshav.agarwal@dailoqa.com',
  'divyom.agarwal@dailoqa.com', 'talapanti.rajesh@dailoqa.com', 'yayivi.vinay@dailoqa.com',
  // 5. ResolveHub
  'aditya.yadav@dailoqa.com', 'saksham.gupta@dailoqa.com', 'sourabh.pal@dailoqa.com',
  // 6. TMS-AUTO
  'divyansh.agarwal@dailoqa.com', 'sameer.shukla@dailoqa.com', 'himanshu.gupta@dailoqa.com',
  'anshuman.mishra@dailoqa.com', 'nishant.sindhu@dailoqa.com',
  // 7. FinCredit AI
  'aakash.yadav@dailoqa.com', 'anushka.sharma@dailoqa.com', 'vaivashvat.upadhyay@dailoqa.com',
  'titirsha.singh@dailoqa.com', 'nikhil.bisla@dailoqa.com',
  // 8. NEXORA
  'anant.vaibhav@dailoqa.com', 'anant.sharma@dailoqa.com', 'athira.r.pillai@dailoqa.com',
  'piyush.yadav@dailoqa.com', 'arth.saxena@dailoqa.com',
  // 9. CP-REVIEW
  'saloni.rana@dailoqa.com', 'khushi.bainsla@dailoqa.com', 'yash.tanwar@dailoqa.com',
  'tanmay.garg@dailoqa.com', 'nitin.aman@dailoqa.com',
  // 10. BankShield
  'aryan.sharma@dailoqa.com', 'jatin.malik@dailoqa.com', 'ansh.kukreti@dailoqa.com',
  // 11. RAMS
  'sarthak.shah@dailoqa.com', 'mayank.j.malu@dailoqa.com', 'prince.kumar@dailoqa.com',
  'anshuman.mathur@dailoqa.com', 'ayush.rai@dailoqa.com',
  // 12. TMS-PMS
  'm.n.reddy@dailoqa.com', 'p.g.srihitha@dailoqa.com', 's.r.teja@dialoqa.com',
  'sanka.m.srujan@dailoqa.com', 'm.v.somanadh@dailoqa.com', 'j.pramod@dailoqa.com',
  // 13. AI-TAD
  'harsh.kumar@dailoqa.com', 'bharat.yadav@dailoqa.com', 'pranav.suresh@dailoqa.com',
  'nitin.singh@dailoqa.com', 'deepanshu.dangi@dailoqa.com',
  // 14. AI-QA-BUGS
  'kanak.varshney@dailoqa.com', 'rohit.raghav@dailoqa.com', 'darsheel.jaiswal@dailoqa.com',
  'mann.upadhyay@dailoqa.com', 'garvita.singh@dailoqa.com',
  // 15. LOAN-ANALYSER
  'sivaram.s.alla@dailoqa.com', 'peram.m.reddy@dailoqa.com', 'rudraraju.s.varma@dailoqa.com',
  'penmetsa.h.varma@dailoqa.com', 'k.s.reddy@dailoqa.com',
];

async function main() {
  const users = await prisma.user.findMany({
    where: { organization: { name: 'Dailoqa Technologies' } },
    select: { id: true, email: true, name: true },
  });

  const emailToUser = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  let found = 0;
  let missing = 0;

  for (const email of targetEmails) {
    const u = emailToUser.get(email.toLowerCase());
    if (u) {
      found++;
    } else {
      console.warn('MISSING USER IN DB:', email);
      missing++;
    }
  }

  console.log(`Found: ${found} / ${targetEmails.length}, Missing: ${missing}`);
}

main().finally(() => prisma.$disconnect());

