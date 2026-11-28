(() => {
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const paymentId=params.get('payment');
  if(!driveRequireAuth('payment-result.html'+location.search))return;

  const renderStatus=(payment)=>{
    const status=payment.effectiveStatus||payment.status||'pending';
    const labels={
      paid:['Payment confirmed','success','Your payment has been validated and recorded by DRIVE.'],
      risk_hold:['Payment under review','warning','SSLCOMMERZ validated the transaction but flagged it for additional review. DRIVE has not released the payment yet.'],
      pending:['Payment pending','warning','The payment has not yet been confirmed. Wait for the gateway notification or refresh this page.'],
      failed:['Payment failed','danger','The gateway or administrator marked this payment as failed. You can retry from your trip history.'],
      refunded:['Payment refunded','success','This payment is recorded as refunded.'],
    };
    const view=labels[status]||['Payment status: '+status,'warning','The latest payment state is shown below.'];
    $('paymentStatusBadge').className='pill '+view[1];
    $('paymentStatusBadge').textContent=status.replaceAll('_',' ');
    $('paymentStatusTitle').textContent=view[0];
    $('paymentStatusMessage').textContent=view[2];
    $('paymentStatusError').textContent='';
    if(status==='paid')loadReceipt();
    else $('receiptCard').hidden=true;
  };

  async function loadReceipt(){
    try{
      const receipt=await driveRequest('/payments/'+encodeURIComponent(paymentId)+'/receipt');
      const rows=[
        ['Receipt number',receipt.receiptNumber],
        ['Payment ID',receipt.paymentId],
        ['Paid at',driveDate(receipt.paidAt)],
        ['Paid amount',Number(receipt.amount).toFixed(2)+' '+receipt.currency],
        ['Original fare (BDT)','৳'+Number(receipt.baseAmountBDT).toFixed(2)],
        ['Gateway settlement (BDT)',receipt.settlementAmountBDT==null?'—':'৳'+Number(receipt.settlementAmountBDT).toFixed(2)],
        ['Exchange rate',receipt.exchangeRate==null?'—':String(receipt.exchangeRate)],
        ['Method',receipt.method],
        ['Provider reference',receipt.providerReference||'—'],
      ];
      $('receiptDetails').innerHTML=rows.map(([label,value])=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(label)+'</strong><small>'+driveEscape(value)+'</small></div></div>').join('');
      $('receiptCard').hidden=false;
    }catch(error){$('paymentStatusError').textContent='Payment is confirmed, but the receipt could not be loaded: '+error.message;}
  }

  async function refresh(){
    if(!paymentId){
      $('paymentStatusTitle').textContent='Payment reference missing';
      $('paymentStatusMessage').textContent='Open this page from your DRIVE payment history or gateway return link.';
      $('paymentStatusBadge').className='pill danger';
      $('paymentStatusBadge').textContent='Unavailable';
      return;
    }
    $('refreshPaymentStatus').disabled=true;
    try{
      const payment=await driveRequest('/payments/'+encodeURIComponent(paymentId)+'/status');
      renderStatus(payment);
    }catch(error){
      $('paymentStatusError').textContent=error.message;
      $('paymentStatusTitle').textContent='Could not retrieve payment status';
    }finally{$('refreshPaymentStatus').disabled=false;}
  }
  $('refreshPaymentStatus').addEventListener('click',refresh);
  refresh();
})();