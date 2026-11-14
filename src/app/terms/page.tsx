import PolicyPage from "@/components/policy-page";

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of use">
      <p>
        Intube Drama is operated by Intube Media and provides access to short-form video stories
        at intubedrama.com. Keep your account sign-in information secure and use the service in a
        lawful way.
      </p>
      <p>
        Some features may require a paid subscription or coins. Subscription plans renew
        automatically until canceled. You can manage or cancel a subscription through the account
        subscription options; contact us if you need help.
      </p>
      <p>
        Coins are used for eligible in-app features. Coin purchases are non-refundable except for
        failed or duplicate charges, as described in our refund policy.
      </p>
      <p>
        For questions about these terms, contact
        {" "}<a className="text-rose-300" href="mailto:intubemediaofficial@gmail.com">intubemediaofficial@gmail.com</a>.
      </p>
    </PolicyPage>
  );
}
