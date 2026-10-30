import { Panel } from "../components/ui";

export default function CompliancePage() {
  return (
    <div className="p-5">
      <Panel className="p-10 text-center">
        <div className="font-mono text-[11px] tracking-[0.2em] text-volt-2 uppercase">Module in progress</div>
        <p className="mt-3 text-sm text-mute">This screen is being built next. The backend API for it is already live.</p>
      </Panel>
    </div>
  );
}
