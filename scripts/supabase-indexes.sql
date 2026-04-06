create unique index if not exists eps_client_list_client_id_uidx
on public.eps_client_list (client_id)
where client_id is not null;

create unique index if not exists drivers_driver_code_uidx
on public.drivers (driver_code)
where driver_code is not null;

create unique index if not exists vehiclesc_registration_number_uidx
on public.vehiclesc (registration_number)
where registration_number is not null;
