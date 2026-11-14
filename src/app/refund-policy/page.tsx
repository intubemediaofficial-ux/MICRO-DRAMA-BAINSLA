import PolicyPage from "@/components/policy-page";

export default function RefundPolicyPage() {
  return (
    <PolicyPage title="Refund policy">
      <p>
        Payments for subscriptions and coin packs are processed by Razorpay. We do not store card
        details.
      </p>
      <p>
        Coin purchases are non-refundable, except when a charge failed but money was debited or
        when the same charge was collected more than once. Contact us with the account email or
        phone number and payment reference so we can review the issue.
      </p>
      <p>
        Canceling a subscription stops future renewals; it does not by itself reverse a payment
        already processed. For a billing question, email
        {" "}<a className="text-rose-300" href="mailto:intubemediaofficial@gmail.com">intubemediaofficial@gmail.com</a>.
      </p>
    </PolicyPage>
  );
}
