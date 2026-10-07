// /verify-email?email= — VerifyEmailView (the sign-up OTP screen).
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VerifyEmail } from "@/features/auth/VerifyEmail";

function Inner() {
  const params = useSearchParams();
  return <VerifyEmail email={(params.get("email") ?? "").trim().toLowerCase()} />;
}

export default function VerifyEmailPage() {
  return <Suspense><Inner /></Suspense>;
}
