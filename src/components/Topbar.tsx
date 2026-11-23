"use client";

import Image from "next/image";
import { useAppData } from "@/context/AppContext";
import SyncBadge from "@/components/SyncBadge";

export default function Topbar({
  mode,
  onLogout,
  onBack,
}: {
  mode: string;
  onLogout: () => void;
  onBack?: () => void;
}) {
  const { storageReady } = useAppData();
  return (
    <div className="topbar">
      <div className="title">
        <Image src="/logo.png" alt="ZPlash" width={79} height={30} className="topbar-logo" unoptimized />
        <span className="mode">{mode}</span>
      </div>
      <div className="topbar-right">
        <SyncBadge storageReady={storageReady} />
        {onBack && (
          <button className="logout-btn" onClick={onBack}>
            ← Menú
          </button>
        )}
        <button className="logout-btn" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
