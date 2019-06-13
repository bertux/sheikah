<template>
  <NavigationCard
    class="wallet-seed-validation"
    title="Confirm your seed phrase"
    previousText="Back"
    nextText="Next"
    :previousStep="previousStep"
    :nextStep="nextStep"
  >
    <div class="content">
      <p>
        Please type your 12 word seed phrase exactly as it was shown to you on the previous screen.
        This step is to confirm that you have copied your seed phrase correctly.
      </p>
      <Input type="big" class="seed" :model.sync="seed" />
      <p v-if="showError">Mnemonics must match</p>
      <p class="paragraph">
        Please ensure you do not add any extra spaces between words or at the beginning or end
        of the phrase.
      </p>
    </div>
  </NavigationCard>
</template>

<script>
import NavigationCard from '@/components/NavigationCard'
import Input from '@/components/Input.vue'
export default {
  name: 'WalletSeedValidation',
  components: {
    NavigationCard,
    Input,
  },
  data () {
    return {
      seed: '',
      showError: '',
    }
  },
  methods: {
    nextStep () {
      if (this.seed.trim() === this.$store.state.mnemonics.trim()) {
        this.$router.push('/ftu/encryption-pass')
        this.showError = false
      } else {
        this.showError = true
      }
    },
    previousStep () {
      this.$router.push('/ftu/seed-backup')
    },
  },
}
</script>
<style lang="scss" scoped>
@import '@/styles/theme.scss';

.content {
  padding: 40px;
}

.seed {
  align-items: center;
  border: $input_big-border;
  border-radius: $input_big-border-radius;
  box-sizing: border-box;
  color: $input_big-color;
  display: inline-flex;
  font-size: 16px;
  line-break: auto;
  line-height: 1.5em;
  margin: 30px 0;
  padding: 15px;
  width: 100%;
  margin-top: 40px;
}

.paragraph {
  margin-top: 15px;
}

</style>