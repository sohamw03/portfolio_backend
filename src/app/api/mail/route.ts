import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  const { name, email, message } = await req.json();
  try {
    // const response = await fetch("https://api.resend.com/emails", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${RESEND_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     from: "Portfolio Mailing System <pms@resend.dev>",
    //     to: ["waghmare.22111255@viit.ac.in"],
    //     subject: `${name}`,
    //     html: `<p>${message}</p><p>${email}</p>`,
    //   }),
    // });

    if ("response.ok") {
      // const data = await response.json();
      return NextResponse.json({ data: "", payload: { name: name, email: email, message: message } });
    }
  } catch (error) {
    console.log(error);
    return NextResponse.json({ error: error });
  }
}
