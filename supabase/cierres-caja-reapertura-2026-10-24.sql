-- Pedido de reapertura de la caja del día (Administración lo pide, Gerencia aprueba).
alter table cierres_caja add column if not exists reapertura_solicitada_por text;
alter table cierres_caja add column if not exists reapertura_solicitada_en timestamptz;
alter table cierres_caja add column if not exists reapertura_motivo text;
