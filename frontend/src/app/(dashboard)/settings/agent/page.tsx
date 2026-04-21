import { AgentSettingsForm } from "@/components/settings/AgentSettingsForm";

export default function AgentSettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-100">Agente AI</h1>
      <p className="mt-1 text-sm text-slate-300">
        Personalizza il comportamento dell&apos;agente nelle campagne.
      </p>
      <div className="mt-6">
        <AgentSettingsForm />
      </div>
    </>
  );
}
