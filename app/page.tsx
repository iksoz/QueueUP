import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { QueueApp } from "./queue-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#07110d] p-5 text-[#f4f7ef]">
        <section className="w-full max-w-md overflow-hidden rounded-[30px] border border-white/10 bg-[#102019] shadow-[0_30px_100px_rgba(0,0,0,.35)]">
          <div className="relative border-b border-[#d9ff63]/15 bg-[#173426] p-7">
            <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(217,255,99,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(217,255,99,.18)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="relative grid size-14 place-items-center rounded-2xl bg-[#d9ff63] text-[#142115]"><Users className="size-7" /></div>
            <h1 className="relative mt-6 text-4xl font-black tracking-[-.06em]">QueueUP</h1>
            <p className="relative mt-2 text-base leading-relaxed text-white/60">Live court queues that move when the players do.</p>
          </div>
          <div className="p-7">
            <p className="text-sm leading-relaxed text-white/55">Sign in so your place in line stays attached to you across phones and refreshes.</p>
            <Button asChild size="lg" className="mt-6 h-14 w-full rounded-2xl bg-[#d9ff63] text-base font-black text-[#142115] hover:bg-[#c8ef4e]">
              <a href={chatGPTSignInPath("/")} target="_top">Sign in to see courts <ArrowRight /></a>
            </Button>
          </div>
        </section>
      </main>
    );
  }
  return <QueueApp />;
}
