/* ---------------------------------------------------------------
   Pulso — FONTE ÚNICA dos preços dos planos.
   Mude aqui e o site inteiro acompanha (planos + FAQ). Consistência:
   estes valores TÊM que bater com os planos exibidos no app e com a cota.
   Dinheiro em centavos inteiros, como no core (nunca float).
   --------------------------------------------------------------- */
window.PULSO_PRECOS = {
  essencial: { nome: 'Essencial', mensalCents: 9700 },
  crescimento: { nome: 'Crescimento', mensalCents: 14700 },
  pro: { nome: 'Pro', mensalCents: 19700 },
};

(function () {
  var precos = window.PULSO_PRECOS;
  function reais(cents) {
    return 'R$ ' + Math.round(cents / 100).toLocaleString('pt-BR');
  }
  // preenche todo elemento marcado com data-preco="essencial|crescimento|pro".
  // Se o JS não rodar, o texto que já está no HTML serve de fallback.
  document.querySelectorAll('[data-preco]').forEach(function (el) {
    var plano = precos[el.getAttribute('data-preco')];
    if (plano) el.textContent = reais(plano.mensalCents);
  });
})();
