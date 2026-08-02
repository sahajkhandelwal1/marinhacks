import { classifierLabel, ciLabel, sdpLabel, type Frame } from "./data";

interface Props {
  frame: Frame;
  disagreement: boolean;
}

// The numbers are the interface: three oversized readouts. SDP is the incumbent
// (steel), CI is VIGIL's live coupling signal (amber), the model is a
// spectral-blind classifier (violet, grouped with SDP). NOT MEASURED is a real,
// visibly distinct state — never a faked zero.
export function ParameterRail({ frame, disagreement }: Props) {
  return (
    <div className="rail">
      <Module
        label="SDP"
        unit="depth index"
        sub="conventional monitor"
        value={frame.sdp.toFixed(0)}
        verdict={sdpLabel(frame.sdp)}
        verdictClass={frame.sdp < 45 ? "verdict-deep" : ""}
        color="var(--steel)"
      />

      {frame.ci == null ? (
        <ModuleNotMeasured label="CI" unit="coupling index" sub="VIGIL" color="var(--signal)" />
      ) : (
        <Module
          label="CI"
          unit="coupling index"
          sub="VIGIL · vs. awake baseline"
          value={frame.ci.toFixed(2)}
          verdict={ciLabel(frame.ci)}
          verdictClass={frame.ci >= 0.5 ? "verdict-live" : ""}
          color="var(--signal)"
          emphasize={disagreement}
        />
      )}

      {frame.classifier_prob == null ? (
        <ModuleNotMeasured
          label="MODEL"
          unit="P(responsive)"
          sub="spectral-only classifier"
          color="var(--violet)"
        />
      ) : (
        <Module
          label="MODEL"
          unit="P(responsive)"
          sub="spectral-only · same blind spot as SDP"
          value={frame.classifier_prob.toFixed(2)}
          verdict={classifierLabel(frame.classifier_prob)}
          verdictClass=""
          color="var(--violet)"
        />
      )}
    </div>
  );
}

function Module(props: {
  label: string;
  unit: string;
  sub: string;
  value: string;
  verdict: string;
  verdictClass: string;
  color: string;
  emphasize?: boolean;
}) {
  return (
    <div className={`module${props.emphasize ? " module-emph" : ""}`}>
      <div className="module-head">
        <span className="module-label" style={{ color: props.color }}>
          {props.label}
        </span>
        <span className="cap module-unit">{props.unit}</span>
      </div>
      <div className="module-value" style={{ color: props.color }}>
        {props.value}
      </div>
      <div className={`module-verdict ${props.verdictClass}`}>{props.verdict}</div>
      <div className="cap module-sub">{props.sub}</div>
    </div>
  );
}

function ModuleNotMeasured(props: {
  label: string;
  unit: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="module module-nm">
      <div className="module-head">
        <span className="module-label" style={{ color: props.color, opacity: 0.5 }}>
          {props.label}
        </span>
        <span className="cap module-unit">{props.unit}</span>
      </div>
      <div className="module-nm-value">NOT&nbsp;MEASURED</div>
      <div className="module-nm-note">no coupling channel on this feed</div>
      <div className="cap module-sub">{props.sub}</div>
    </div>
  );
}
