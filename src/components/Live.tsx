      <p className="sr-only" aria-live="polite">{prepared.alert}</p>
      {open && <button className="request-rail-scrim" aria-label="Close requests" onClick={() => setRailOpen(false)} />}
      {open && <aside id="request-rail" className="request-rail is-open" aria-label="Active student requests">
        <header>
          <div><p className="eyebrow">QUIET SIGNALS</p><h2>Requests <span>{prepared.requests.length}</span></h2></div>
          <button className="icon-button" onClick={() => setRailOpen(false)} aria-label="Close requests">×</button>
        </header>
        <label className="request-sound"><input type="checkbox" checked={sound} onChange={(event) => { setSound(event.target.checked); localStorage.setItem("request-alert-sound", String(event.target.checked)); }} /> Sound for new requests</label>
        <div className="request-rail-lanes">
          {prepared.lanes.filter((lane) => lane.requests.length > 0).map((lane) => {
            const isCompletion = lane.behavior === "completion";
            const expanded = !isCompletion || completionOpen[lane.id];
            const activeAttention = lane.behavior === "attention" ? lane.requests.find((request) => request.status === "active") : undefined;
            return <section className="request-rail-lane" key={lane.id} style={{ "--lane": lane.color } as CSSProperties}>
              <div className="request-lane-heading">
                {isCompletion ? <button onClick={() => setCompletionOpen((value) => ({ ...value, [lane.id]: !expanded }))} aria-expanded={expanded}><span>{lane.label}</span><b>{lane.requests.length}</b><i>{expanded ? "−" : "+"}</i></button> : <><strong>{lane.label}</strong><b>{lane.requests.length}</b></>}
                {lane.behavior === "attention" && activeAttention && <button className="request-next" onClick={async () => { try { setSnapshot(await dataStore.acknowledgeNextRequest(classId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "The next request could not be selected."); } }}>Next</button>}
              </div>
              {expanded && <div className="request-items">
                {lane.requests.map((request, index) => {
                  const name = prepared.students.get(request.studentId)?.displayName ?? "Learner";
                  return <article className={`request-item ${request.status} ${prepared.newIds.has(request.id) ? "is-new" : ""}`} key={request.id}>
                    <div className="request-item-copy">
                      {lane.behavior === "attention" && <span className="request-position">{index + 1}</span>}
                      <span><strong>{name}</strong><small>{request.status === "acknowledged" ? "Acknowledged" : lane.behavior === "attention" ? `Waiting ${wait(request.joinedAt)}` : `Requested ${wait(request.joinedAt)}`}</small></span>
                    </div>
                    <div className="request-actions">
                      {request.status === "active" && <button onClick={() => act(request.id, "acknowledge", name)}>Acknowledge</button>}
                      <button className="request-resolve" onClick={() => act(request.id, "resolve", name)}>{lane.resolveLabel}</button>
                      <button aria-label={`Clear ${name}'s request`} onClick={() => act(request.id, "cancel", name)}>Clear</button>
                    </div>
                  </article>;
                })}
              </div>}
            </section>;
          })}
        </div>
      </aside>}
      {undo && <div className="request-undo" role="status"><span>{undo.name}'s request {undo.action}.</span><button onClick={async () => { try { setSnapshot(await dataStore.requestAction(classId, undo.id, "restore")); setUndo(undefined); } catch (reason) { setError(reason instanceof Error ? reason.message : "That request could not be restored."); } }}>Undo</button><button aria-label="Dismiss" onClick={() => setUndo(undefined)}>×</button></div>}
    </>
  );
}
 
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty card">
      <span>✦</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
 