"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    });

    const hiddenElements = document.querySelectorAll(".fade-up");
    hiddenElements.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <>
      <div className="scanlines"></div>
      
      {/* Top Navigation Shell */}
      <nav className="nn-nav">
        <div className="nn-nav__brand">
          <span>TERMINAL</span>
        </div>
        <div className="nn-nav__status">
          <div className="nn-status-dot crimson-pulse"></div>
          <span>System Status: Nominal</span>
        </div>
      </nav>

      <main className="nn-main">
        {/* Hero Section */}
        <section className="nn-hero grid-bg">
          <div className="nn-hero__gradient"></div>
          <div className="nn-hero__content fade-up">
            <div className="nn-badge">
              <span>[ SECURITY CLEARANCE: LEVEL 0 ]</span>
            </div>
            <h1 className="nn-title">
              BUILD THE <br /> UNTRACEABLE
            </h1>
            <p className="nn-subcopy">
              Deploy sovereign AI agents on a decentralized, encrypted backbone. 
              Absolute privacy is no longer a luxury—it is the protocol.
            </p>
            <div className="nn-hero__actions">
              <button
                className="nn-btn nn-btn--primary glow-cyan"
                onClick={() => router.push("/workflows")}
              >
                INITIALIZE UPLINK
              </button>
            </div>
          </div>
          <div className="nn-scroll-indicator">
            <span>SCROLL_TO_DESCEND</span>
            <span className="nn-arrow-down">↓</span>
          </div>
        </section>

        {/* Operational Capabilities Section */}
        <section className="nn-features">
          <div className="nn-container fade-up">
            <div className="nn-features__header">
              <div>
                <span className="nn-features__eyebrow">Core Architecture</span>
                <h2 className="nn-features__title">OPERATIONAL CAPABILITIES</h2>
              </div>
              <div className="nn-features__line hidden-mobile"></div>
              <div className="nn-features__version">
                VERSION_4.02.9 // REPOS_STABLE
              </div>
            </div>

            <div className="nn-grid-3">
              {/* Card 1 */}
              <div className="nn-card glass-panel fade-up" style={{ transitionDelay: "100ms" }}>
                <span className="nn-card__module">MODULE_01</span>
                <h3 className="nn-card__title">Encrypted Core</h3>
                <p className="nn-card__text">
                  Utilize advanced end-to-end encryption layers that ensure your AI's decision-making process and data remains entirely opaque to third parties.
                </p>
                <div className="nn-card__status text-pale-cyan">
                  <span className="icon">🔒</span> AES-256-GCM ACTIVE
                </div>
              </div>

              {/* Card 2 */}
              <div className="nn-card glass-panel fade-up" style={{ transitionDelay: "200ms" }}>
                <span className="nn-card__module">MODULE_02</span>
                <h3 className="nn-card__title">Autonomous Logic</h3>
                <p className="nn-card__text">
                  Agents operate with absolute autonomy, processing complex logic gates across isolated environments without ever phoning home to central servers.
                </p>
                <div className="nn-card__status text-crimson crimson-pulse">
                  <span className="icon">⚡</span> NEURAL_ISOLATION_REACHED
                </div>
              </div>

              {/* Card 3 */}
              <div className="nn-card glass-panel fade-up" style={{ transitionDelay: "300ms" }}>
                <span className="nn-card__module">MODULE_03</span>
                <h3 className="nn-card__title">Global Node Network</h3>
                <p className="nn-card__text">
                  Harness a decentralized infrastructure of encrypted nodes. Your agents are distributed globally, making the network impossible to dismantle.
                </p>
                <div className="nn-card__status text-pale-cyan">
                  <span className="icon">🌐</span> NODES_ONLINE: 14,882
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="nn-cta fade-up">
          <div className="nn-cta__glow"></div>
          <div className="nn-cta__content">
            <h2 className="nn-cta__title">READY TO DEPLOY?</h2>
            <p className="nn-cta__text">
              Join the vanguard of privacy-preserving AI. The network is waiting for your signature. 
              Begin the initialization sequence now.
            </p>
            <button
              className="nn-btn nn-btn--white"
              onClick={() => router.push("/workflows")}
            >
              START DEPLOYMENT PHASE
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
