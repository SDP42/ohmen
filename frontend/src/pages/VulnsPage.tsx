import { useMutation, useQuery } from "@tanstack/react-query";
import { Bug, CloudDownload, ExternalLink, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Kv, Loading, Panel, PanelHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { cn, scoreColor } from "../lib/format";
import { useUi } from "../lib/store";

const STATUS_COLOR: Record<string, string> = { confirmed: "#f43f5e", potential: "#fbbf24", not_applicable: "#5d6d8f" };

export default function VulnsPage() {
  const { select } = useUi();
  const { data: advisories } = useQuery({ queryKey: ["vulns"], queryFn: api.vulnerabilities });
  const [open, setOpen] = useState<string | null>(null);
  const kev = useMutation({ mutationFn: api.syncKev });
  if (!advisories) return <Loading />;
  const confirmed = advisories.reduce((a, v) => a + v.confirmed, 0);
  const potential = advisories.reduce((a, v) => a + v.potential, 0);
  const kevOpen = advisories.filter((v) => v.kev && v.confirmed > 0).length;
  const pending = advisories.filter((v) => v.ingested === false);
  const current = advisories.find((v) => v.id === open) ?? advisories.find((v) => v.confirmed > 0);

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Advisories tracked", advisories.length, "#8cc8ff"],
          ["Confirmed matches", confirmed, "#f43f5e"],
          ["Potential matches", potential, "#fbbf24"],
          ["Known-exploited open", kevOpen, "#fb923c"],
        ].map(([l, v, c]) => (
          <Panel key={l as string} className="p-4">
            <div className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{l}</div>
            <div className="mt-1 font-mono text-3xl font-semibold" style={{ color: c as string }}>
              {v}
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader title="Vulnerability intelligence" icon={<Bug className="size-3.5" />} sub="Matched on product identity and version ranges, not vendor names" />
          <div className="divide-y divide-white/[0.04]">
            {advisories.map((v) => (
              <button key={v.id} onClick={() => setOpen(v.id)} className={cn("block w-full px-4 py-3 text-left transition hover:bg-white/[0.02]", current?.id === v.id && "bg-volt/[0.07]")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12.5px] font-semibold text-white">{v.id}</span>
                  <Badge color={scoreColor(v.cvss * 10)}>CVSS {v.cvss}</Badge>
                  {v.kev && <Badge color="#f43f5e">known exploited</Badge>}
                  <Badge>{v.exploit_maturity}</Badge>
                  {v.ingested === false && <Badge color="#a78bfa">pending ingestion</Badge>}
                  <span className="ml-auto font-mono text-[10.5px] text-dim">{v.published}</span>
                </div>
                <div className="mt-1 text-[12.5px] text-[#c9d7f0]">{v.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10.5px] text-dim">
                    {v.vendor} {v.product} · {v.affected}
                  </span>
                  {v.matches.map((m: { asset: string; status: string }) => (
                    <span key={m.asset} className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ color: STATUS_COLOR[m.status], background: `${STATUS_COLOR[m.status]}18` }}>
                      {m.asset}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-4 xl:col-span-5">
          {current && (
            <Panel>
              <PanelHeader title={current.id} icon={<ShieldAlert className="size-3.5" />} sub={current.source} />
              <div className="space-y-3 p-4 text-[12.5px]">
                <p className="leading-relaxed text-[#c9d7f0]">{current.summary}</p>
                <div className="hud p-3">
                  <Kv k="Product" v={`${current.vendor} ${current.product}`} />
                  <Kv k="Affected versions" v={<span className="font-mono">{current.affected}</span>} />
                  <Kv k="Fixed in" v={<span className="font-mono">{current.fixed_version}</span>} />
                  <Kv k="Vector" v={<span className="font-mono text-[10.5px]">{current.cvss_vector.replace("CVSS:3.1/", "")}</span>} />
                  <Kv k="Weakness" v={current.cwe} />
                  <Kv k="EPSS-style likelihood" v={current.epss} />
                </div>
                <div>
                  <div className="mb-1.5 font-mono text-[10px] tracking-widest text-dim uppercase">Affected assets</div>
                  {current.matches.length === 0 && <div className="text-dim">{current.ingested === false ? "Not yet ingested. Run the flagship incident to publish it." : "No inventory entry carries this product."}</div>}
                  {current.matches.map((m: { asset: string; status: string; reason: string; version: string }) => (
                    <button key={m.asset} onClick={() => select(m.asset)} className="block w-full border-b border-white/[0.04] py-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-white">
                          {m.asset} <span className="text-dim">v{m.version}</span>
                        </span>
                        <Badge color={STATUS_COLOR[m.status]}>{m.status.replace("_", " ")}</Badge>
                      </div>
                      <div className="mt-0.5 text-[11px] text-mute">{m.reason}</div>
                    </button>
                  ))}
                </div>
                <div className="rounded-md border border-ok/30 bg-ok/[0.06] p-3 text-[12px] text-[#bdf3d9]">
                  <span className="font-mono text-[10px] tracking-widest text-ok uppercase">Remediation · </span>
                  {current.remediation}
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader
              title="Live public intelligence"
              icon={<CloudDownload className="size-3.5" />}
              sub="CISA Known Exploited Vulnerabilities catalogue"
              right={
                <Button size="sm" variant="outline" onClick={() => kev.mutate()} disabled={kev.isPending}>
                  {kev.isPending ? <Spinner className="size-3" /> : <CloudDownload className="size-3.5" />} Sync now
                </Button>
              }
            />
            <div className="p-4 text-[12px]">
              {!kev.data && !kev.isError && <p className="text-dim">Pull the public catalogue to see the latest known-exploited entries relevant to OT: SCADA, PLCs, gateways, VPN and remote access.</p>}
              {kev.isError && <p className="text-crit">{(kev.error as Error).message}</p>}
              {kev.data && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded bg-white/[0.03] py-2">
                      <div className="font-mono text-lg text-white">{kev.data.total.toLocaleString()}</div>
                      <div className="text-[10px] text-dim">catalogue entries</div>
                    </div>
                    <div className="rounded bg-white/[0.03] py-2">
                      <div className="font-mono text-lg text-white">{kev.data.ot_relevant}</div>
                      <div className="text-[10px] text-dim">OT-relevant</div>
                    </div>
                    <div className="rounded bg-white/[0.03] py-2">
                      <div className="font-mono text-lg text-white">{kev.data.inventory_vendor_matches}</div>
                      <div className="text-[10px] text-dim">inventory matches</div>
                    </div>
                  </div>
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {kev.data.latest.map((k: { cveID: string; vendorProject: string; product: string; vulnerabilityName: string; dateAdded: string }) => (
                      <a key={k.cveID} href={`https://nvd.nist.gov/vuln/detail/${k.cveID}`} target="_blank" rel="noreferrer" className="block rounded-md border border-line p-2 hover:border-line-strong">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-white">{k.cveID}</span>
                          <span className="flex items-center gap-1 text-dim">
                            {k.dateAdded} <ExternalLink className="size-3" />
                          </span>
                        </div>
                        <div className="text-[11.5px] text-[#c9d7f0]">{k.vulnerabilityName}</div>
                        <div className="text-[10.5px] text-dim">
                          {k.vendorProject} · {k.product}
                        </div>
                      </a>
                    ))}
                  </div>
                  <p className="mt-2 text-[10.5px] text-dim">{kev.data.note}</p>
                </>
              )}
              {pending.length > 0 && <p className="mt-3 text-[11px] text-cyber">{pending.length} synthetic advisory pending: it is published during the flagship incident.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
