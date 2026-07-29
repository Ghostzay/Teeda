"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function revalidateSchedule() {
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
  revalidatePath("/tech");
  revalidatePath("/appointments");
}
