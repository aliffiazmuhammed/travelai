const LandingChat = () => {
  return (
    <div className="overflow-hidden rounded-[26px] border border-border/70 bg-card shadow-card">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <img
          src="/brand/waytowalk-symbol.svg"
          alt=""
          className="h-8 w-8"
          aria-hidden="true"
        />
        <div>
          <p className="text-xs font-bold text-foreground">Trip planning with waytowalk</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Your route, ready to make your own
          </p>
        </div>
      </div>

      <div className="space-y-4 bg-background/40 p-5 sm:p-6">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-xs leading-6 text-primary-foreground">
          Four of us want a quiet week in Kerala with good food, short drives and time outdoors.
        </div>

        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted/60 px-4 py-4 text-xs leading-6 text-foreground">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            waytowalk
          </p>
          Start in Kochi, take one scenic drive to Munnar, then slow down by the
          backwaters. Here’s a balanced first route.
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["Days 1–2 · Kochi", "Days 3–4 · Munnar", "Days 5–7 · Alleppey"].map((day) => (
              <span
                key={day}
                className="rounded-xl border border-border/70 bg-card px-2 py-3 text-center text-[9px] font-bold text-primary"
              >
                {day}
              </span>
            ))}
          </div>
        </div>

        <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-xs leading-6 text-primary-foreground">
          Can we swap one Munnar day for a cooking class?
        </div>
      </div>
    </div>
  );
};

export default LandingChat;
