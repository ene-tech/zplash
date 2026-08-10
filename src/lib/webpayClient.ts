function redirigirConToken(url: string, nombreCampo: string, token: string): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = nombreCampo;
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

// Webpay Plus exige un POST con token_ws al `url` que devuelve /api/pagos/webpay/crear,
// no un simple redirect GET — se arma un form invisible y se autoenvía.
export function redirigirAWebpay(url: string, token: string): void {
  redirigirConToken(url, "token_ws", token);
}

// Igual que redirigirAWebpay pero para la inscripción Oneclick Mall, que usa
// TBK_TOKEN en vez de token_ws — devuelto por /api/pagos/oneclick/inscribir.
export function redirigirAInscripcionOneclick(url: string, token: string): void {
  redirigirConToken(url, "TBK_TOKEN", token);
}
